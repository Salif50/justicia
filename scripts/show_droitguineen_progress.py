#!/usr/bin/env python3
"""Affiche la progression des collectes Droitguinéen en cours."""

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "droitguineen" / "raw"
NORMALIZED = ROOT / "data" / "droitguineen" / "normalized"
SITEMAP_FILES = {"textes": "lois", "journal_officiel": "journal-officiel", "ohada": "pages", "creation_entreprise": "pages"}


def expected(category: str) -> int:
    path = RAW / f"sitemap-{SITEMAP_FILES.get(category, category)}.xml"
    if not path.exists():
        return 0
    content = path.read_text(encoding="utf-8")
    if category == "articles":
        return len(re.findall(r"<loc>[^<]*/article/", content))
    if category == "ohada":
        return len(re.findall(r"<loc>[^<]*/ohada[^<]*</loc>", content))
    if category == "creation_entreprise":
        return len(re.findall(r"<loc>[^<]*/creation-entreprise[^<]*</loc>", content))
    return len(re.findall(r"<loc>", content))


def main() -> None:
    print("JusticIA — progression collecte Droitguinéen\n")
    prioritaire = {"articles", "textes", "journal_officiel", "jurisprudence", "ohada", "creation_entreprise"}
    for path in sorted(NORMALIZED.glob("*.jsonl")):
        if path.stem not in prioritaire:
            continue
        rows = [line for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        unique: dict[str, dict] = {}
        for line in rows:
            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue
            key = item.get("canonical_url") or item.get("source_url") or line
            if key not in unique or len(item.get("content", "")) > len(unique[key].get("content", "")):
                unique[key] = item
        ok = errors = empty = 0
        for item in unique.values():
            if item.get("error"):
                errors += 1
            elif item.get("content"):
                ok += 1
            else:
                empty += 1
        total = expected(path.stem)
        observed = len(unique)
        suffix = f" / {total}" if total else ""
        pct = f" ({observed / total * 100:.1f} %)" if total else ""
        print(f"{path.stem:20} {observed:5}{suffix:8}{pct:9} | contenus: {ok:5} | vides: {empty:4} | erreurs: {errors:3}")


if __name__ == "__main__":
    main()
