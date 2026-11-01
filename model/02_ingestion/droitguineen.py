"""
Lecture et nettoyage de la collecte droitguineen.com (dossier data/droitguineen).

Ce module ne fait que LIRE la collecte et la normaliser : aucun texte n'est
réécrit, résumé ou complété. Les seules transformations sont mécaniques
(suppression du menu et du pied de page du site, recollage des lignes coupées
par un lien hypertexte, découpage en sections pour la jurisprudence).

Utilisé par import_droitguineen.py (construction du corpus) et par les audits.
"""

from __future__ import annotations

import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data" / "droitguineen" / "organized"
SITE = "https://droitguineen.com"

# Début du pied de page commun à toutes les pages du site
_FOOTER_MARKERS = (
    "\nPlateforme de référence pour l'accès au droit guinéen",
    "\nInformations\n\nPlateforme de référence",
)
# Charge utile Next.js (RSC) collée après le texte des décisions
_RSC_RE = re.compile(r'[0-9a-f]{1,4}:\[\[\[\\"\$\\"')   # préfixe hexadécimal (« 2a: »)


# ── Outils texte ─────────────────────────────────────────────────────────────

def norm(text: str) -> str:
    """Forme de comparaison : minuscules, sans accents ni ponctuation."""
    text = unicodedata.normalize("NFKD", (text or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[’'`´]", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def strip_footer(content: str) -> str:
    cut = len(content)
    for marker in _FOOTER_MARKERS:
        i = content.find(marker)
        if i >= 0:
            cut = min(cut, i)
    body = content[:cut].rstrip()
    if body.endswith("Informations"):
        body = body[: -len("Informations")].rstrip()
    return body


_JOIN_NEXT = re.compile(r"^(?:l[’']\s*)?(?:articles?|alin[ée]as?|art\.)\b", re.I)


def repair_lines(paragraphs: list[str]) -> list[str]:
    """Recolle les paragraphes coupés par un lien (« … de l'\\n\\narticle 68. »).

    Sur le site, un renvoi à un article est un lien rendu dans un bloc séparé :
    le texte extrait se retrouve coupé en plein milieu d'une phrase. On ne
    recolle que ce cas précis (renvoi « article/alinéa » en minuscule après
    une ligne qui ne se termine pas par une ponctuation de fin).
    """
    out: list[str] = []
    for p in paragraphs:
        p = p.strip()
        if not p:
            continue
        if out:
            prev = out[-1]
            ends_open = not re.search(r"[.;:!?»)\]]$", prev)
            starts_ref = bool(_JOIN_NEXT.match(p)) and p[:1].islower()
            if prev.endswith(("'", "’")) or (ends_open and starts_ref) or (ends_open and p[:1] in ".,;:)"):
                sep = "" if prev.endswith(("'", "’")) or p[:1] in ".,;:)" else " "
                out[-1] = prev + sep + p
                continue
        out.append(p)
    return out


# En-têtes de page du Journal officiel restés dans le texte lors de l'extraction
# (« JO Spécial Août 2019 JOURNAL OFFICIEL DE LA REPUBLIQUE DE GUINEE 50 »).
_JO_HEADER_RE = re.compile(
    r"[ \t]*(?:\bJO(?:\s+Sp[ée]cial)?\s+[A-Za-zÀ-ÿ]+\s+\d{4}\s+"
    r"|SOMMAIRE\s+Sp[ée]cial\s+[^\n]{3,60}?\s+)?"
    r"JOURNAL\s+OFFICIE?L?(?:\s+DE\s+LA\s+R[ÉE]PUBLIQUE(?:\s+DE\s+GUIN[ÉE]E)?)?(?:\s+\d{1,4}\b)?[ \t]*"
)


def clean_running_headers(text: str) -> str:
    """Retire les en-têtes de page du JO ; recolle un mot coupé par l'en-tête."""
    def repl(m: re.Match) -> str:
        before = text[m.start() - 1] if m.start() > 0 else " "
        after = text[m.end()] if m.end() < len(text) else " "
        # « transbordeSOMMAIRE … 02 ment » → « transbordement »
        if before.isalpha() and after.isalpha() and before.islower() and after.islower():
            return ""
        return " "
    # Ne touche pas aux mentions légitimes (« publié au Journal officiel de la République »)
    if not re.search(r"JOURNAL\s+OFFICIE", text):
        return text
    out = _JO_HEADER_RE.sub(repl, text)
    return re.sub(r"[ \t]{2,}", " ", out).strip()


def natural_key(num: str) -> tuple:
    """Tri naturel des numéros d'article : 2 < 10 < 58-3 < 58-10 < 100 bis."""
    parts = re.findall(r"\d+|[a-zA-Z]+", num or "")
    key = []
    for p in parts:
        key.append((0, int(p), "") if p.isdigit() else (1, 0, p.lower()))
    return tuple(key) or ((2, 0, num),)


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def manifest_items(category: str | None = None) -> list[dict]:
    items = load_json(DATA_DIR / "manifest.json")["items"]
    return [i for i in items if category is None or i["category"] == category]


# ── Codes et Actes uniformes, article par article ────────────────────────────

_ART_URL_RE = re.compile(r"/lois/([^/]+)/article/([^/?#]+)")
_HEADER_RE = re.compile(r"^(?P<ref>[^·\n]{1,80}?)\s*·\s*(?P<hier>.+)$")
_ARTICLE_LINE_RE = re.compile(r"^Article\s+(?P<num>.{1,24}?)\s+—\s+(?P<doc>.+)$")
_DOC_LINE_RE = re.compile(r"^(?:Code|Acte Uniforme OHADA|Loi|Ordonnance|Décret)\s+—\s+(?P<doc>.+)$")
_HIER_KEYS = ("LIVRE", "PARTIE", "TITRE", "SOUS-TITRE", "CHAPITRE", "SECTION", "SOUS-SECTION", "PARAGRAPHE")
_HIER_SPLIT_RE = re.compile(
    r"(?=\b(?:LIVRE|PARTIE|SOUS[- ]TITRE|TITRE|CHAPITRE|SOUS[- ]SECTION|SECTION|PARAGRAPHE|Livre|Titre|Chapitre|Section|Paragraphe|Sous-section)\b)"
)


def _split_hierarchy(hier: str) -> dict:
    """« TITRE II - X CHAPITRE PREMIER: Y » → {"titre": "TITRE II - X", "chapitre": "CHAPITRE PREMIER: Y"}."""
    fields: dict[str, str] = {}
    for chunk in _HIER_SPLIT_RE.split(hier or ""):
        chunk = chunk.strip(" .")
        if not chunk:
            continue
        head = chunk.split()[0].upper().replace(" ", "-")
        key = {
            "LIVRE": "livre", "PARTIE": "partie", "TITRE": "titre", "SOUS-TITRE": "sous_titre",
            "CHAPITRE": "chapitre", "SECTION": "section", "SOUS-SECTION": "sous_section",
            "PARAGRAPHE": "paragraphe",
        }.get(head)
        if key and key not in fields:
            fields[key] = chunk
        elif fields:
            last = list(fields)[-1]
            fields[last] = f"{fields[last]} {chunk}"
    if not fields and hier:
        fields["section"] = hier.strip()
    return fields


def parse_article_page(doc: dict) -> dict | None:
    """Une page « /lois/<code>/article/<n> » → article normalisé (ou None si inexploitable)."""
    url = doc.get("canonical_url") or doc.get("source_url") or ""
    m = _ART_URL_RE.search(url)
    if not m or "content" not in doc:
        return None
    slug, num = m.group(1), m.group(2)
    body = strip_footer(doc["content"])
    paragraphs = [p for p in body.split("\n") if p.strip()]

    header_ref = hierarchy = doc_name = ""
    # En-tête optionnel : « L/2016/059/AN · TITRE I - … », « Article 941 — Code pénal », « Code — Code pénal »
    if paragraphs:
        first = paragraphs[0].strip()
        if len(paragraphs) > 1 and _ARTICLE_LINE_RE.match(paragraphs[1].strip()) and len(first) <= 300:
            hm = _HEADER_RE.match(first)
            if hm:
                header_ref, hierarchy = hm.group("ref").strip(), hm.group("hier").strip()
            else:
                header_ref = first
            paragraphs = paragraphs[1:]
    if paragraphs:
        am = _ARTICLE_LINE_RE.match(paragraphs[0].strip())
        if am:
            doc_name = am.group("doc").strip()
            paragraphs = paragraphs[1:]
    if paragraphs and _DOC_LINE_RE.match(paragraphs[0].strip()):
        doc_name = doc_name or _DOC_LINE_RE.match(paragraphs[0].strip()).group("doc")
        paragraphs = paragraphs[1:]

    paragraphs = repair_lines(paragraphs)
    texte = clean_running_headers("\n".join(paragraphs).strip())
    title = (doc.get("title") or "").replace(" | Droitguinéen", "").strip()
    if not header_ref:
        header_ref = title.split(",")[0].strip() if "," in title else ""
    art = {
        "slug": slug,
        "num": num,
        "article_ref": f"Article {num}",
        "texte": texte,
        "doc_name": doc_name,
        "texte_ref": header_ref,
        "hierarchy": hierarchy,
        "source_url": url,
        "retrieved_at": doc.get("retrieved_at", ""),
        "sha256": doc.get("content_sha256", ""),
    }
    art.update(_split_hierarchy(hierarchy))
    return art


def load_code_articles() -> dict[str, list[dict]]:
    """{slug du texte: [articles triés]} — doublons d'URL éliminés."""
    by_slug: dict[str, dict[str, dict]] = defaultdict(dict)
    for item in manifest_items("article"):
        doc = load_json(DATA_DIR / item["file"])
        art = parse_article_page(doc)
        if not art or not art["texte"]:
            continue
        prev = by_slug[art["slug"]].get(art["num"])
        if prev is None or len(art["texte"]) > len(prev["texte"]):
            by_slug[art["slug"]][art["num"]] = art
    return {
        slug: sorted(arts.values(), key=lambda a: natural_key(a["num"]))
        for slug, arts in by_slug.items()
    }


def failed_pages() -> list[dict]:
    """Pages dont la collecte a échoué (ex. HTTP 503) — à recollecter."""
    out = []
    for path in sorted(DATA_DIR.glob("*/*.json")):
        if path.name == "manifest.json":
            continue
        try:
            doc = load_json(path)
        except Exception:
            continue
        if isinstance(doc, dict) and doc.get("error"):
            out.append({"url": doc.get("source_url"), "error": doc["error"]})
    return out


# ── Pages « texte intégral » (titre officiel, description) ───────────────────

def load_text_pages() -> dict[str, dict]:
    """{slug: page} pour les catégories textes / ohada / journal_officiel."""
    pages: dict[str, dict] = {}
    for cat in ("textes", "ohada", "journal_officiel", "bibliotheque"):
        for item in manifest_items(cat):
            doc = load_json(DATA_DIR / item["file"])
            path = doc.get("path") or ""
            slug = path.rstrip("/").split("/")[-1]
            doc["_slug"] = slug
            doc["_body"] = strip_footer(doc.get("content", ""))
            doc["_title"] = (doc.get("title") or "").replace(" | Droitguinéen", "").strip()
            pages[slug] = doc
    return pages


# ── Jurisprudence ────────────────────────────────────────────────────────────

def _decode_initial_data(payload: str) -> dict | None:
    """Extrait l'objet « initialData » (métadonnées structurées) de la charge RSC."""
    key = '\\"initialData\\":'
    k = payload.find(key)
    if k < 0:
        return None
    raw = payload[k + len(key):]
    # La charge est une chaîne JSON échappée une fois : on la décode morceau par morceau.
    end = len(raw)
    for _ in range(6):
        try:
            decoded = json.loads('"' + raw[:end] + '"')
            break
        except json.JSONDecodeError as e:
            # Coupe juste avant le caractère fautif (fin de charge tronquée)
            end = max(0, min(end, e.pos - 1) - 1)
            while end > 0 and raw[end - 1] == "\\":
                end -= 1
    else:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(decoded)
        return obj if isinstance(obj, dict) else None
    except json.JSONDecodeError:
        return None


_MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
    "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}
_DATE_RE = re.compile(r"\b(\d{1,2})(?:er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})\b", re.I)


def parse_fr_date(text: str) -> str:
    m = _DATE_RE.search(text or "")
    if not m:
        return ""
    month = _MONTHS[norm(m.group(2))]
    return f"{int(m.group(3)):04d}-{month:02d}-{int(m.group(1)):02d}"


def load_decisions_raw() -> list[dict]:
    out = []
    for item in manifest_items("jurisprudence"):
        doc = load_json(DATA_DIR / item["file"])
        content = doc.get("content", "")
        m = _RSC_RE.search(content)
        text = content[: m.start()] if m else strip_footer(content)
        meta = _decode_initial_data(content[m.start():]) if m else None
        out.append({"doc": doc, "text": text.strip(), "meta": meta or {}})
    return out
