"""Audit reproductible du corpus juridique avant une réindexation.

Ce script ne modifie ni les documents ni les index. Il signale les trous de
couverture, les textes vides, les références dupliquées et les désynchronisations
entre ChromaDB et BM25.
"""

from __future__ import annotations

import argparse
import json
import pickle
from collections import Counter
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
CORPUS_DIR = BASE_DIR / "corpus"
ARTICLES_DIR = CORPUS_DIR / "articles"
PDF_DIR = CORPUS_DIR / "pdfs"
METADATA_FILE = CORPUS_DIR / "metadata.json"
VECTORSTORE_DIR = BASE_DIR / "03_vectorstore"
BM25_PATH = VECTORSTORE_DIR / "bm25_index.pkl"
INDEX_MANIFEST = VECTORSTORE_DIR / "active_index.json"
COLLECTION_NAME = "justicia_guinee"
# Ce fichier est un doublon local du PDF officiellement référencé pour doc_023.
KNOWN_DUPLICATE_PDFS = {"codetravail.pdf"}


def load_json(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def active_index_config(manifest_path: Path | None = None) -> tuple[Path, str]:
    manifest_path = manifest_path or INDEX_MANIFEST
    if not manifest_path.is_file():
        return BM25_PATH, COLLECTION_NAME
    manifest = load_json(manifest_path)
    return (
        VECTORSTORE_DIR / str(manifest["bm25_path"]),
        str(manifest["collection"]),
    )


def audit(check_indexes: bool = False, manifest_path: Path | None = None) -> int:
    metadata = {item["doc_id"]: item for item in load_json(METADATA_FILE)}
    files = sorted(ARTICLES_DIR.glob("doc_*.json"))
    file_ids = {path.stem for path in files}

    missing_articles = sorted(set(metadata) - file_ids)
    missing_metadata = sorted(file_ids - set(metadata))
    missing_pdfs = sorted(
        doc_id for doc_id, item in metadata.items()
        if not (PDF_DIR / item.get("source_pdf", "")).is_file()
    )
    declared_pdfs = {
        str(item.get("source_pdf", ""))
        for item in metadata.values()
        if item.get("source_pdf")
    }
    orphan_pdfs = sorted(
        path.name for path in PDF_DIR.glob("*.pdf")
        if path.name not in declared_pdfs and path.name not in KNOWN_DUPLICATE_PDFS
    )

    total = non_empty = 0
    empty: list[str] = []
    structural_empty: list[str] = []
    short: list[str] = []
    duplicate_ids: list[str] = []
    duplicate_refs: list[str] = []
    domains = Counter()

    for path in files:
        articles = load_json(path)
        ids = [str(article.get("id", "")) for article in articles if article.get("id")]
        refs = [str(article.get("article_ref", "")) for article in articles if article.get("article_ref")]
        duplicate_ids.extend(f"{path.stem}:{value}" for value, count in Counter(ids).items() if count > 1)
        duplicate_refs.extend(f"{path.stem}:{value}" for value, count in Counter(refs).items() if count > 1)
        for index, article in enumerate(articles):
            total += 1
            text = str(article.get("texte", "")).strip()
            if not text:
                item = f"{path.stem}[{index}] {article.get('article_ref', '')}"
                if not str(article.get("article_ref", "")).strip():
                    structural_empty.append(item)
                else:
                    empty.append(item)
                continue
            non_empty += 1
            if len(text) < 30:
                short.append(f"{path.stem}:{article.get('article_ref', '')}={text!r}")
            domains[metadata.get(path.stem, {}).get("domaine", "inconnu")] += 1

    print("JusticIA — audit corpus")
    print(f"Documents JSON : {len(files)} | métadonnées : {len(metadata)}")
    print(f"Articles total : {total} | non vides/indexables : {non_empty}")
    print(
        f"Articles vides : {len(empty)} | entrées structurelles sans article : "
        f"{len(structural_empty)} | courts (<30 caractères) : {len(short)}"
    )
    print(f"Doublons d'identifiants : {len(duplicate_ids)} | références répétées : {len(duplicate_refs)}")
    print(f"PDF non référencés/non indexés : {len(orphan_pdfs)}")
    print("Répartition par domaine :")
    for domain, count in sorted(domains.items()):
        print(f"  {domain}: {count}")

    errors = []
    if missing_articles:
        errors.append(f"métadonnées sans JSON: {', '.join(missing_articles)}")
    if missing_metadata:
        errors.append(f"JSON sans métadonnées: {', '.join(missing_metadata)}")
    if missing_pdfs:
        errors.append(f"PDF source absent: {', '.join(missing_pdfs)}")
    if duplicate_ids:
        errors.append("identifiants dupliqués: " + ", ".join(duplicate_ids))
    if empty:
        errors.append(f"{len(empty)} article(s) sans texte exploitable")
    if orphan_pdfs:
        errors.append("PDF non référencés: " + ", ".join(orphan_pdfs))
    if errors:
        print("\nERREURS DE COUVERTURE :")
        for error in errors:
            print(f"  - {error}")

    if empty:
        print("\nTextes vides à revoir (non indexés) :")
        for item in empty[:30]:
            print(f"  - {item}")
    if structural_empty:
        print("\nEntrées structurelles vides (non indexées, sans référence d'article) :")
        for item in structural_empty[:30]:
            print(f"  - {item}")
    if short:
        print("\nTextes courts conservés par l'ingestion :")
        for item in short[:30]:
            print(f"  - {item}")
    if orphan_pdfs:
        print("\nPDF présents mais non référencés (aucune indexation automatique) :")
        for item in orphan_pdfs:
            print(f"  - {item}")

    active_bm25_path, active_collection_name = active_index_config(manifest_path)
    if active_bm25_path.is_file():
        try:
            with active_bm25_path.open("rb") as handle:
                data = pickle.load(handle)
            bm25_ids = set(data.get("ids", []))
            print(f"\nBM25 : {len(bm25_ids)} identifiants")
        except ModuleNotFoundError as exc:
            bm25_ids = set()
            print(f"\nBM25 : lecture impossible, dépendance absente ({exc.name})")
            if check_indexes:
                errors.append(f"lecture BM25 impossible ({exc.name})")
    else:
        bm25_ids = set()
        print("\nBM25 : absent")

    if check_indexes:
        try:
            import chromadb

            client = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))
            collection = client.get_collection(active_collection_name)
            chroma = collection.get(include=[])
            chroma_ids = set(chroma["ids"])
            print(f"ChromaDB : {len(chroma_ids)} identifiants")
            if bm25_ids and chroma_ids != bm25_ids:
                print(
                    "DÉSYNCHRONISATION : "
                    f"BM25\\Chroma seulement BM25={len(bm25_ids - chroma_ids)}, "
                    f"seulement Chroma={len(chroma_ids - bm25_ids)}"
                )
                errors.append("BM25 et ChromaDB ne contiennent pas les mêmes identifiants")
        except Exception as exc:
            print(f"ChromaDB : contrôle impossible ({type(exc).__name__})")
            errors.append("contrôle ChromaDB impossible")

    return 1 if errors else 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-indexes", action="store_true")
    parser.add_argument(
        "--manifest",
        type=Path,
        help="manifeste d'index à contrôler (utile pour un staging avant activation)",
    )
    args = parser.parse_args()
    raise SystemExit(audit(args.check_indexes, args.manifest))
