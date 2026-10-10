"""
Script d'ingestion v3 :
  Corpus  : corpus/articles/ (JSON par texte juridique, source de vérité)
  Encoder : OrdalieTech/Solon-embeddings-large-0.1  (E5-large fine-tuné droit français)
  Sorties : ChromaDB (cosine, 1024 dims) + bm25_index.pkl
"""

import json
import pickle
import re
import argparse
from datetime import datetime, timezone
from pathlib import Path

import chromadb
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

# ── Chemins ───────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent       # model/
CORPUS_DIR      = BASE_DIR / "corpus"         # model/corpus/
JSONL_PATH      = CORPUS_DIR / "corpus.jsonl"        # corpus complet
ARTICLES_DIR    = CORPUS_DIR / "articles"            # JSON par document
METADATA_FILE   = CORPUS_DIR / "metadata.json"       # métadonnées officielles
VECTORSTORE_DIR = BASE_DIR / "03_vectorstore"
BM25_PATH       = VECTORSTORE_DIR / "bm25_index.pkl"
INDEX_MANIFEST  = VECTORSTORE_DIR / "active_index.json"

# OrdalieTech/Solon : basé sur E5-large, spécialisé droit français (+15-20% precision)
# Préfixes E5 obligatoires : "passage:" pour l'indexation, "query:" pour les requêtes
EMBEDDING_MODEL = "OrdalieTech/Solon-embeddings-large-0.1"
COLLECTION_NAME = "justicia_guinee"
BATCH_SIZE      = 128   # 1024 dims → batches plus petits qu'avec mpnet (768 dims)
# Un article court peut porter une information décisive (ex. « Abrogé »).
# Seuls les textes réellement vides sont exclus.
MIN_TEXT_LEN    = 1

# ── Mots vides français ───────────────────────────────────────────────────────
STOPWORDS_FR = set([
    "le","la","les","de","du","des","un","une","et","ou","à","au","aux","en",
    "que","qui","dans","sur","par","pour","est","sont","avec","il","elle",
    "ils","elles","se","si","ne","pas","plus","ce","cette","ces","tout",
    "tous","toute","toutes","leur","leurs","son","sa","ses","nous","vous",
    "je","tu","on","y","d","l","j","m","n","s","qu","c","a","ai","as","ont",
    "dont","car","mais","donc","or","ni","car","cet","tel","tels","telle",
    "telles","même","très","bien","aussi","comme","quand","alors","après",
    "avant","entre","vers","sans","sous","lors","dès","selon",
])

LEGAL_NORMALIZATION = {
    "articles": "article", "infractions": "infraction", "sanctions": "sanction",
    "peines": "peine", "obligations": "obligation", "conditions": "condition",
    "droits": "droit", "indemnités": "indemnité", "salariés": "salarié",
    "employeurs": "employeur", "contrats": "contrat",
    "licenciements": "licenciement", "héritiers": "héritier",
    "enfants": "enfant", "citoyens": "citoyen", "électeurs": "électeur",
    "candidats": "candidat", "crimes": "crime", "délits": "délit",
    "amendes": "amende", "travaux": "travail", "baux": "bail",
}


def preprocess_text(text: str) -> list[str]:
    """Tokenise et filtre les stop words pour BM25."""
    text = text.lower()
    text = re.sub(r"[^\w\sàâäéèêëîïôùûüç]", " ", text)
    tokens = text.split()
    return [
        LEGAL_NORMALIZATION.get(t, t) for t in tokens
        if t not in STOPWORDS_FR and (len(t) > 2 or t.isdigit())
    ]


def load_metadata() -> dict:
    with open(METADATA_FILE, encoding="utf-8") as f:
        items = json.load(f)
    return {item["doc_id"]: item for item in items}


def build_embed_context(article: dict, meta: dict | None = None) -> str:
    """Construit le texte enrichi avec toute la hiérarchie disponible."""
    parts = []
    if meta:
        parts.extend(filter(None, [meta.get("nom", ""), meta.get("numero", "")]))
    if article.get("article_ref"):
        parts.append(article["article_ref"])
    # Hiérarchie documentaire : tous les champs possibles dans les deux formats
    for champ in ["partie", "livre", "division", "titre", "sous_titre",
                  "chapitre", "section", "sous_section"]:
        val = article.get(champ, "").strip()
        if val:
            parts.append(val)
    parts.append(article.get("texte", ""))
    return " | ".join(parts)


def _embed_batch(model: SentenceTransformer, texts: list[str]) -> list[list[float]]:
    """Encode un batch avec le préfixe E5 'passage:' et normalisation cosine."""
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(
        prefixed,
        show_progress_bar=False,
        normalize_embeddings=True,   # indispensable pour cosine similarity correcte
        batch_size=BATCH_SIZE,
    ).tolist()


def process_doc(
    doc_id:       str,
    articles:     list[dict],
    meta:         dict,
    collection,
    model:        SentenceTransformer,
    bm25_ids:     list,
    bm25_corpus:  list,
    bm25_domains: dict,
    source_label: str = "JSONL",
) -> int:
    """Indexe un document entier dans ChromaDB + prépare les données BM25."""
    ids, embed_texts, metadatas = [], [], []

    for i, article in enumerate(articles):
        texte = article.get("texte", "").strip()
        if not texte:
            continue

        # Utilise le champ 'id' du JSONL quand disponible, sinon génère
        uid        = article.get("id") or f"{doc_id}_art_{i:04d}"
        embed_text = build_embed_context(article, meta)

        ids.append(uid)
        embed_texts.append(embed_text)
        metadatas.append({
            "doc_id":      doc_id,
            "article_ref": article.get("article_ref", ""),
            "page":        str(article.get("page", "")),
            "titre":       article.get("titre", ""),
            "chapitre":    article.get("chapitre", ""),
            "section":     article.get("section", ""),
            "texte":       texte,
            "nom":         meta.get("nom", ""),
            "domaine":     meta.get("domaine", ""),
            "type_doc":    meta.get("type", ""),
            "numero":      meta.get("numero", ""),
            "date":        meta.get("date_promulgation", ""),
            "source":      meta.get("source_officielle", ""),
            "source_url":  meta.get("url_source", ""),
            "source_file": meta.get("source_pdf", ""),
            "source_status": meta.get("verification_status") or (
                "projet" if "projet" in (
                    f"{meta.get('nom', '')} {meta.get('source_pdf', '')} {meta.get('url_source', '')}"
                ).lower() else "publie"
            ),
        })

        bm25_ids.append(uid)
        bm25_corpus.append(preprocess_text(embed_text))
        bm25_domains[uid] = meta.get("domaine", "")

    if not ids:
        return 0

    n_batches = (len(ids) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"     {len(ids)} articles — {n_batches} batch(s) à encoder...", flush=True)

    # Embedding par batch avec préfixe E5 + progression visible
    for batch_num, start in enumerate(range(0, len(ids), BATCH_SIZE), 1):
        end        = start + BATCH_SIZE
        print(f"       [{batch_num}/{n_batches}] batch {start+1}–{min(end, len(ids))}...", end=" ", flush=True)
        embeddings = _embed_batch(model, embed_texts[start:end])
        collection.add(
            ids=ids[start:end],
            embeddings=embeddings,
            metadatas=metadatas[start:end],
            documents=embed_texts[start:end],
        )
        print("✓", flush=True)

    print(f"     ✅ {len(ids)} articles indexés.", flush=True)
    return len(ids)


def ingest(activate: bool = False, version: str | None = None):
    VECTORSTORE_DIR.mkdir(parents=True, exist_ok=True)
    version = version or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    staging_collection_name = f"{COLLECTION_NAME}_staging_{version}"
    staging_bm25_path = VECTORSTORE_DIR / f"bm25_index_{version}.pkl"

    print(f"Chargement du modèle d'embedding : {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)

    print("Connexion à ChromaDB...")
    client = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))

    existing = [c.name for c in client.list_collections()]
    if staging_collection_name in existing:
        raise RuntimeError(
            f"La version de staging existe déjà : {staging_collection_name}. "
            "Choisissez une autre version pour éviter d'écraser un index."
        )

    collection = client.create_collection(
        name=staging_collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    metadata_map = load_metadata()

    bm25_ids: list     = []
    bm25_corpus: list  = []
    bm25_domains: dict = {}
    total              = 0

    # ── Corpus : corpus/articles/ (32 fichiers JSON, source de vérité) ──────────
    print(f"\nLecture du corpus : {ARTICLES_DIR}")
    data_files = sorted(ARTICLES_DIR.glob("doc_*.json"))
    print(f"  {len(data_files)} fichiers trouvés")

    file_doc_ids = {path.stem for path in data_files}
    metadata_doc_ids = set(metadata_map)
    missing_articles = sorted(metadata_doc_ids - file_doc_ids)
    missing_metadata = sorted(file_doc_ids - metadata_doc_ids)
    if missing_articles or missing_metadata:
        raise RuntimeError(
            "Corpus incomplet — "
            f"métadonnées sans articles: {missing_articles or 'aucune'}; "
            f"articles sans métadonnées: {missing_metadata or 'aucun'}."
        )

    missing_pdfs = sorted(
        doc_id for doc_id, meta in metadata_map.items()
        if not (CORPUS_DIR / "pdfs" / meta.get("source_pdf", "")).is_file()
    )
    if missing_pdfs:
        raise RuntimeError(f"PDF sources absents pour: {missing_pdfs}")

    for data_file in data_files:
        doc_id = data_file.stem
        meta   = metadata_map.get(doc_id, {})
        print(f"  → {doc_id} : {meta.get('nom', '?')[:55]}")
        try:
            with open(data_file, encoding="utf-8") as f:
                articles = json.load(f)
        except Exception as e:
            print(f"     ⚠ Illisible ({e}) — ignoré.")
            continue
        total += process_doc(
            doc_id, articles, meta, collection, model,
            bm25_ids, bm25_corpus, bm25_domains, "JSON",
        )

    # ── Construction de l'index BM25 ─────────────────────────────────────────
    print(f"\nConstruction de l'index BM25 ({len(bm25_ids)} articles)...")
    bm25_index = BM25Okapi(bm25_corpus)

    with open(staging_bm25_path, "wb") as f:
        pickle.dump({
            "bm25":    bm25_index,
            "ids":     bm25_ids,
            "domains": bm25_domains,
        }, f)

    collection_ids = set(collection.get(include=[]).get("ids", []))
    if collection_ids != set(bm25_ids):
        raise RuntimeError(
            "Index staging incohérent avant activation : "
            f"ChromaDB seulement={len(collection_ids - set(bm25_ids))}, "
            f"BM25 seulement={len(set(bm25_ids) - collection_ids)}"
        )

    manifest = {
        "version": version,
        "collection": staging_collection_name,
        "bm25_path": staging_bm25_path.name,
        "article_count": collection.count(),
        "embedding_model": EMBEDDING_MODEL,
        "metric": "cosine",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    manifest_staging = VECTORSTORE_DIR / f"active_index_{version}.json"
    with manifest_staging.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    if activate:
        previous_manifest = None
        if INDEX_MANIFEST.is_file():
            previous_manifest = VECTORSTORE_DIR / f"previous_index_{version}.json"
            previous_manifest.write_bytes(INDEX_MANIFEST.read_bytes())
        manifest_staging.replace(INDEX_MANIFEST)
        print(f"Index activé : {staging_collection_name} ({version})")
        if previous_manifest:
            print(f"Rollback disponible via : {previous_manifest}")
    else:
        print(f"Staging prêt (non activé) : {manifest_staging}")

    print(f"Index BM25 sauvegardé → {staging_bm25_path}")
    print(f"\n✅ Ingestion terminée : {total} articles dans l'index staging.")
    print(f"   Modèle  : {EMBEDDING_MODEL}")
    print(f"   ChromaDB: {collection.count()} articles")
    print(f"   BM25    : {len(bm25_ids)} articles")


def activate_staging(version: str) -> None:
    """Active uniquement un staging déjà construit et audité."""
    manifest_staging = VECTORSTORE_DIR / f"active_index_{version}.json"
    if not manifest_staging.is_file():
        raise FileNotFoundError(f"Manifest staging absent : {manifest_staging}")
    manifest = json.loads(manifest_staging.read_text(encoding="utf-8"))
    bm25_path = VECTORSTORE_DIR / str(manifest.get("bm25_path", ""))
    if not bm25_path.is_file():
        raise FileNotFoundError(f"BM25 staging absent : {bm25_path}")
    client = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))
    collection = client.get_collection(str(manifest.get("collection", "")))
    expected_count = int(manifest.get("article_count", -1))
    if collection.count() != expected_count:
        raise RuntimeError(
            f"Staging incomplet : manifest={expected_count}, ChromaDB={collection.count()}"
        )
    previous_manifest = None
    if INDEX_MANIFEST.is_file():
        previous_manifest = VECTORSTORE_DIR / f"previous_index_{version}.json"
        previous_manifest.write_bytes(INDEX_MANIFEST.read_bytes())
    manifest_staging.replace(INDEX_MANIFEST)
    print(f"Index activé : {manifest.get('collection')} ({version})")
    if previous_manifest:
        print(f"Rollback disponible via : {previous_manifest}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Construire un index juridique versionné")
    parser.add_argument("--activate", action="store_true", help="activer après validation locale")
    parser.add_argument("--activate-version", default=None, help="activer un staging déjà audité")
    parser.add_argument("--version", default=None, help="identifiant de version explicite")
    args = parser.parse_args()
    if args.activate_version:
        activate_staging(args.activate_version)
    else:
        ingest(activate=args.activate, version=args.version)
