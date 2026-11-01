#!/usr/bin/env python3
"""Collecte reproductible du contenu public de droitguineen.com.

Le collecteur utilise uniquement les sitemaps et les pages HTML publiques
(robots.txt interdit explicitement /api et /export). Il est volontairement
resumable : chaque URL est écrite dans un fichier JSONL après traitement.

Exemples :
  python scripts/crawl_droitguineen.py --max-pages 100
  python scripts/crawl_droitguineen.py --category jurisprudence
  python scripts/crawl_droitguineen.py --all --workers 6 --delay 0.2
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "droitguineen"
RAW = DATA / "raw"
NORMALIZED = DATA / "normalized"
BASE = "https://droitguineen.com"
SITEMAPS = {
    "pages": "sitemap/pages.xml",
    "textes": "sitemap/lois.xml",
    "articles": "sitemap/articles.xml",
    "journal_officiel": "sitemap/journal-officiel.xml",
    "bibliotheque": "sitemap/bibliotheque.xml",
    "actualites": "sitemap/actualites.xml",
}
SITEMAP_FILES = {"textes": "lois", "journal_officiel": "journal-officiel"}
ALLOWED_CATEGORIES = set(SITEMAPS) | {"jurisprudence"}
ALLOWED_CATEGORIES |= {"ohada", "creation_entreprise"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch(url: str, timeout: int = 45) -> tuple[int, str, str]:
    req = Request(url, headers={"User-Agent": "JusticIA-research/1.0 (+https://justicia.gn)"})
    with urlopen(req, timeout=timeout) as response:
        body = response.read()
        charset = response.headers.get_content_charset() or "utf-8"
        return response.status, body.decode(charset, errors="replace"), response.headers.get("content-type", "")


class PageParser(HTMLParser):
    """Extrait le contenu visible sans dépendance HTML externe."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: list[str] = []
        self.description = ""
        self.canonical = ""
        self.meta: dict[str, str] = {}
        self._stack: list[str] = []
        self._skip = 0
        self._in_main = False
        self._in_prose = False
        self._in_title = False
        self._blocks: list[str] = []
        self._current: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        d = dict(attrs)
        self._stack.append(tag)
        if tag in {"script", "style", "noscript", "svg"}:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag == "main" or d.get("id") == "main-content":
            self._in_main = True
        classes = d.get("class", "") or ""
        if "prose" in classes.split():
            self._in_prose = True
        if tag == "meta":
            key = d.get("name") or d.get("property")
            value = d.get("content")
            if key and value:
                self.meta[key] = value
                if key == "description":
                    self.description = value
        if tag == "link" and d.get("rel") == "canonical":
            self.canonical = d.get("href", "")
        if (self._in_prose or self._in_main) and tag in {"p", "li", "h1", "h2", "h3", "h4", "blockquote", "pre"}:
            self._current = []

    def handle_endtag(self, tag: str) -> None:
        if (self._in_prose or self._in_main) and tag in {"p", "li", "h1", "h2", "h3", "h4", "blockquote", "pre"}:
            text = clean_text("".join(self._current))
            if text:
                self._blocks.append(text)
            self._current = []
        if tag == "title":
            self._in_title = False
        if tag in {"script", "style", "noscript", "svg"} and self._skip:
            self._skip -= 1
        if tag == "main":
            self._in_main = False
        if self._stack:
            self._stack.pop()

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        if self._in_title:
            self.title.append(data)
        if self._in_prose or self._in_main:
            self._current.append(data)


def clean_text(value: str) -> str:
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def parse_page(url: str, category: str, status: int, body: str, content_type: str) -> dict:
    parser = PageParser()
    parser.feed(body)
    path = url.split("?", 1)[0]
    parts = [p for p in path.rstrip("/").split("/") if p]
    kind = "article" if "/article/" in path else category
    if "/jurisprudence" in path or "jurisprudence-" in path:
        kind = "jurisprudence"
    if "/journal-officiel/" in path:
        kind = "journal_officiel"
    if "/bibliotheque/" in path:
        kind = "bibliotheque"
    content = "\n\n".join(parser._blocks)
    # Les décisions utilisent parfois des données Next.js sans conteneur
    # ``prose`` : les paragraphes sont alors sérialisés dans ``articles[].contenu``.
    if not content or len(content) < 80:
        encoded = re.findall(r'"contenu":"((?:\\.|[^"\\])*)"', body)
        encoded += re.findall(r'\\"contenu\\":\\"((?:\\\\.|[^"\\])*)\\"', body)
        decoded = []
        for value in encoded:
            try:
                text = json.loads('"' + value + '"')
            except json.JSONDecodeError:
                text = value.replace('\\n', '\n').replace('\\"', '"')
            text = clean_text(text)
            if text and not re.fullmatch(r"\$\d+", text):
                decoded.append(text)
        # Certaines décisions CCJA sont diffusées par React Server Components
        # sous la forme ``46:T2784,TEXTE...`` ; le contenu réel est dans ce
        # segment, tandis que ``articles[].contenu`` ne contient qu'une
        # référence ($46).
        # L'identifiant après T est parfois hexadécimal (ex. T152a), pas
        # uniquement numérique.
        rsc_segments = re.findall(r'(?:^|\\n)\d+:T[0-9a-f]+,([\s\S]*?)(?=\\n\d+:|$)', body)
        for segment in rsc_segments:
            # Les mêmes segments peuvent contenir le JSON-LD de la page ; on
            # ne conserve que les blocs textuels de la décision.
            stripped = segment.lstrip()
            if len(stripped) <= 20 or stripped.startswith(("{\\\"@context", "'{\\\"@context", "{\"@context")):
                continue
            decoded.append(clean_text(segment.replace("\\n", "\n")))
        content = "\n\n".join(dict.fromkeys(decoded))
    parsed_path = urlparse(url).path or "/"
    if not content:
        # Certaines pages de navigation sont livrées avec un squelette SSR et
        # leur contenu détaillé est généré côté client. On conserve au moins
        # leur description éditoriale pour ne pas perdre la page ni son rôle.
        content = clean_text(parser.description or "".join(parser.title))
    return {
        "source": "droitguineen.com",
        "source_url": url,
        "canonical_url": parser.canonical or url,
        "category": kind,
        "path": parsed_path,
        "title": clean_text("".join(parser.title)),
        "description": clean_text(parser.description),
        "content": content,
        "meta": parser.meta,
        "http_status": status,
        "content_type": content_type,
        "retrieved_at": now(),
        "content_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }


def sitemap_urls(category: str) -> list[str]:
    file = RAW / f"sitemap-{SITEMAP_FILES.get(category, category)}.xml"
    if not file.exists():
        status, body, _ = fetch(BASE + "/" + SITEMAPS[category])
        if status != 200:
            raise RuntimeError(f"Sitemap inaccessible ({status}): {category}")
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(body, encoding="utf-8")
    root = ET.fromstring(file.read_text(encoding="utf-8"))
    return [node.text.strip() for node in root.iter() if node.tag.endswith("}loc") and node.text]


def output_for(category: str) -> Path:
    NORMALIZED.mkdir(parents=True, exist_ok=True)
    return NORMALIZED / f"{category}.jsonl"


def allowed_public_page(url: str) -> bool:
    """Applique les exclusions explicites de robots.txt au site."""
    path = url.split("?", 1)[0].lower()
    return not any(path.startswith(BASE + blocked) for blocked in ("/api/", "/export/", "/admin", "/login"))


def collect_one(url: str, category: str, delay: float) -> dict:
    if delay:
        time.sleep(delay)
    try:
        status, body, content_type = fetch(url)
        if status != 200:
            return {"source_url": url, "category": category, "http_status": status, "retrieved_at": now()}
        return parse_page(url, category, status, body, content_type)
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        return {"source_url": url, "category": category, "error": str(exc), "retrieved_at": now()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", choices=sorted(ALLOWED_CATEGORIES), action="append")
    ap.add_argument("--all", action="store_true", help="collecte toutes les catégories")
    ap.add_argument("--max-pages", type=int, default=0, help="limite par catégorie (0 = toutes)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--delay", type=float, default=0.15)
    ap.add_argument("--refresh", action="store_true", help="recollecte même les URL déjà présentes")
    ap.add_argument("--retry-errors", action="store_true", help="recollecte uniquement les URL en erreur")
    args = ap.parse_args()
    # La bibliothèque n'est pas prioritaire pour le corpus juridique ; elle
    # reste disponible uniquement si elle est demandée explicitement ou via
    # ``--all``.
    categories = args.category or (list(SITEMAPS) if args.all else ["articles", "textes", "journal_officiel"])
    try:
        status, robots, _ = fetch(BASE + "/robots.txt")
        (RAW / "robots.txt").write_text(robots, encoding="utf-8")
        if status != 200:
            print(f"robots.txt inaccessible ({status}); arrêt prudent", file=sys.stderr)
            return 2
    except Exception as exc:
        print(f"robots.txt non disponible ({exc}); arrêt prudent", file=sys.stderr)
        return 2
    for category in categories:
        sitemap_category = "textes" if category == "jurisprudence" else (
            "pages" if category in {"ohada", "creation_entreprise"} else category
        )
        urls = sitemap_urls(sitemap_category)
        if category == "jurisprudence":
            urls = [u for u in urls if "jurisprudence" in u.lower()]
        elif category == "ohada":
            urls = [u for u in urls if "/ohada" in u.lower()]
        elif category == "creation_entreprise":
            urls = [u for u in urls if "/creation-entreprise" in u.lower()]
        # Le sitemap articles contient les chapitres et les articles : les articles
        # sont les unités utiles au RAG, mais on garde les autres pages si --all.
        if category == "articles" and not args.all:
            urls = [u for u in urls if "/article/" in u]
        out = output_for(category)
        seen = set()
        failed = set()
        if out.exists() and not args.refresh:
            for line in out.read_text(encoding="utf-8").splitlines():
                try:
                    item = json.loads(line)
                    seen.add(item.get("source_url"))
                    if item.get("error"):
                        failed.add(item.get("source_url"))
                except json.JSONDecodeError:
                    continue
        if args.retry_errors:
            urls = [u for u in urls if u in failed and allowed_public_page(u)]
        else:
            urls = [u for u in urls if u not in seen and allowed_public_page(u)]
        if args.max_pages:
            urls = urls[:args.max_pages]
        print(f"{category}: {len(urls)} URL(s) à collecter → {out}", flush=True)
        if not urls:
            continue
        with out.open("a", encoding="utf-8") as fh, ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            futures = [pool.submit(collect_one, u, category, args.delay) for u in urls]
            for i, future in enumerate(as_completed(futures), 1):
                item = future.result()
                fh.write(json.dumps(item, ensure_ascii=False) + "\n")
                fh.flush()
                if i % 25 == 0 or i == len(futures):
                    print(f"  {i}/{len(futures)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
