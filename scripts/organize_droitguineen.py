#!/usr/bin/env python3
"""Déduplique et répartit la collecte Droitguinéen en fichiers documentaires."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IN_DIR = ROOT / "data" / "droitguineen" / "normalized"
OUT_DIR = ROOT / "data" / "droitguineen" / "organized"


def safe_name(value: str) -> str:
    value = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    value = "-".join(part for part in value.split("-") if part)
    return value[:100] or "document"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", action="store_true", help="recrée les sorties organisées")
    args = ap.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    best_by_url: dict[str, dict] = {}
    counts: dict[str, int] = {}
    for source in sorted(IN_DIR.glob("*.jsonl")):
        for line in source.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            item = json.loads(line)
            url = item.get("canonical_url") or item.get("source_url")
            # Les doublons de sitemap sont fréquents ; l’URL canonique est la clé.
            if not url:
                continue
            previous = best_by_url.get(url)
            if previous and len(previous.get("content", "")) >= len(item.get("content", "")):
                continue
            best_by_url[url] = item
    for url, item in best_by_url.items():
            category = item.get("category") or "non_classe"
            category_dir = OUT_DIR / category
            category_dir.mkdir(parents=True, exist_ok=True)
            identity = item.get("title") or url
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
            filename = f"{safe_name(identity)}--{digest}.json"
            (category_dir / filename).write_text(
                json.dumps(item, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            counts[category] = counts.get(category, 0) + 1
            manifest.append({
                "category": category,
                "title": item.get("title", ""),
                "source_url": url,
                "file": str((category_dir / filename).relative_to(OUT_DIR)),
                "content_chars": len(item.get("content", "")),
                "retrieved_at": item.get("retrieved_at"),
            })
    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"generated_from": str(IN_DIR), "documents": len(manifest), "counts": counts, "items": manifest},
                   ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{len(manifest)} documents organisés", counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
