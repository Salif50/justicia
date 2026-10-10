"""
Réingestion partielle d'un document dans ChromaDB + BM25.

Usage :
    cd model/02_ingestion
    python3 reingest_doc.py doc_008          # réingère le Code pénal
    python3 reingest_doc.py doc_008 doc_012  # plusieurs documents
    python3 reingest_doc.py --all            # tous les documents

Utile quand un document a été indexé depuis un PDF corrompu et que
le JSON source (corpus/articles/) a été corrigé.
"""

import json
import pickle
import re
import sys
from pathlib import Path

import chromadb
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

# ── Chemins (relatifs au script, indépendants du CWD) ────────────────────────
BASE_DIR        = Path(__file__).parent.parent   # model/
CORPUS_DIR      = BASE_DIR / "corpus"
ARTICLES_DIR    = CORPUS_DIR / "articles"
METADATA_FILE   = CORPUS_DIR / "metadata.json"
VECTORSTORE_DIR = BASE_DIR / "03_vectorstore"
INDEX_MANIFEST  = VECTORSTORE_DIR / "active_index.json"
if INDEX_MANIFEST.is_file():
    with INDEX_MANIFEST.open(encoding="utf-8") as _handle:
        _active_index = json.load(_handle)
    BM25_PATH       = VECTORSTORE_DIR / str(_active_index["bm25_path"])
    COLLECTION_NAME = str(_active_index["collection"])
else:
    BM25_PATH       = VECTORSTORE_DIR / "bm25_index.pkl"
    COLLECTION_NAME = "justicia_guinee"

EMBEDDING_MODEL = "OrdalieTech/Solon-embeddings-large-0.1"
BATCH_SIZE      = 64
MIN_TEXT_LEN    = 1  # préserver aussi les dispositions courtes (« Abrogé », etc.)

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


def preprocess(text: str) -> list[str]:
    text = text.lower()
    text = re.sub(r"[^\w\sàâäéèêëîïôùûüç]", " ", text)
    return [
        LEGAL_NORMALIZATION.get(t, t)
        for t in text.split()
        if t not in STOPWORDS_FR and (len(t) > 2 or t.isdigit())
    ]


def build_embed_context(article: dict, meta: dict | None = None) -> str:
    parts = []
    if meta:
        parts.extend(filter(None, [meta.get("nom", ""), meta.get("numero", "")]))
    if article.get("article_ref"):
        parts.append(article["article_ref"])
    for champ in ["partie", "livre", "division", "titre", "sous_titre",
                  "chapitre", "section", "sous_section"]:
        val = article.get(champ, "").strip()
        if val:
            parts.append(val)
    parts.append(article.get("texte", ""))
    return " | ".join(parts)


def embed_batch(model: SentenceTransformer, texts: list[str]) -> list[list[float]]:
    prefixed = [f"passage: {t}" for t in texts]
    return model.encode(
        prefixed,
        show_progress_bar=False,
        normalize_embeddings=True,
        batch_size=BATCH_SIZE,
    ).tolist()


def reingest_doc(
    doc_id: str,
    collection,
    model: SentenceTransformer,
    metadata_map: dict,
) -> tuple[list[str], list[list[str]], dict[str, str]]:
    """
    Supprime les anciens articles de doc_id dans ChromaDB et les réingère
    depuis le JSON source propre.
    Retourne (new_ids, new_corpus_tokens, new_domains) pour mettre à jour BM25.
    """
    json_path = ARTICLES_DIR / f"{doc_id}.json"
    if not json_path.exists():
        print(f"  ❌ {json_path} introuvable — ignoré.")
        return [], [], {}

    meta = metadata_map.get(doc_id, {})
    nom  = meta.get("nom", "?")
    print(f"\n{'─'*60}")
    print(f"  Document : {doc_id} — {nom[:55]}")

    # 1. Supprimer les anciens articles de ce doc dans ChromaDB
    try:
        old_results = collection.get(where={"doc_id": doc_id}, include=[])
        old_ids = old_results["ids"]
        if old_ids:
            collection.delete(ids=old_ids)
            print(f"  ✓ {len(old_ids)} anciens articles supprimés de ChromaDB")
        else:
            print(f"  ℹ️  Aucun article existant dans ChromaDB pour {doc_id}")
    except Exception as e:
        print(f"  ⚠️  Erreur lors de la suppression ChromaDB : {e}")

    # 2. Charger les articles propres depuis JSON
    with open(json_path, encoding="utf-8") as f:
        articles = json.load(f)

    print(f"  → JSON source : {len(articles)} articles")

    # 3. Préparer les données
    ids, embed_texts, metadatas = [], [], []
    new_bm25_ids:     list[str]       = []
    new_bm25_corpus:  list[list[str]] = []
    new_bm25_domains: dict[str, str]  = {}

    for i, article in enumerate(articles):
        texte = article.get("texte", "").strip()
        if not texte:
            continue

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

        new_bm25_ids.append(uid)
        new_bm25_corpus.append(preprocess(embed_text))
        new_bm25_domains[uid] = meta.get("domaine", "")

    if not ids:
        print("  ❌ Aucun article non vide")
        return [], [], {}

    # 4. Indexer dans ChromaDB par batch
    n_batches = (len(ids) + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"  Indexation : {len(ids)} articles, {n_batches} batch(s)")

    for batch_num, start in enumerate(range(0, len(ids), BATCH_SIZE), 1):
        end        = start + BATCH_SIZE
        print(f"    [{batch_num}/{n_batches}] articles {start+1}–{min(end, len(ids))}...", end=" ", flush=True)
        embeddings = embed_batch(model, embed_texts[start:end])
        collection.add(
            ids=ids[start:end],
            embeddings=embeddings,
            metadatas=metadatas[start:end],
            documents=embed_texts[start:end],
        )
        print("✓", flush=True)

    print(f"  ✅ {len(ids)} articles réindexés dans ChromaDB")
    return new_bm25_ids, new_bm25_corpus, new_bm25_domains


def rebuild_bm25(doc_ids_to_replace: set[str], new_data: dict) -> None:
    """
    Met à jour l'index BM25 en remplaçant les entrées des documents concernés.
    new_data : { doc_id → (new_ids, new_corpus, new_domains) }
    """
    print(f"\n{'─'*60}")
    print("  Mise à jour index BM25...")

    # Charger l'index existant
    with open(BM25_PATH, "rb") as f:
        bm25_data = pickle.load(f)

    old_ids:     list[str]       = bm25_data["ids"]
    old_domains: dict[str, str]  = bm25_data["domains"]
    # On ne peut pas extraire les tokens de BM25Okapi — on les reconstruit
    # à partir des IDs restants via ChromaDB (plus sûr)
    # → On filtre juste les IDs qu'on va remplacer

    # Identifier les préfixes d'IDs à supprimer
    # (les IDs des docs concernés commencent par doc_id_)
    ids_to_remove = set()
    for doc_id in doc_ids_to_replace:
        for uid in old_ids:
            if uid.startswith(f"{doc_id}_"):
                ids_to_remove.add(uid)

    old_count = len(old_ids)
    print(f"  BM25 existant : {old_count} articles")
    print(f"  IDs à retirer : {len(ids_to_remove)}")

    # Le BM25Okapi ne stocke pas les tokens — on ne peut pas reconstruire
    # le corpus complet sans re-lire les JSONs ou interroger ChromaDB.
    # Solution : reconstruire BM25 depuis ChromaDB (source fiable et à jour).
    print("  Reconstruction du corpus BM25 depuis ChromaDB...")
    client     = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))
    collection = client.get_collection(COLLECTION_NAME)

    # Récupérer TOUS les articles de ChromaDB (par page de 5000)
    all_ids, all_tokens, all_domains = [], [], {}
    offset = 0
    page   = 5000
    while True:
        batch = collection.get(
            include=["metadatas"],
            limit=page,
            offset=offset,
        )
        if not batch["ids"]:
            break
        for uid, meta in zip(batch["ids"], batch["metadatas"]):
            texte = meta.get("texte", "")
            if texte:
                embed_text = build_embed_context(meta, meta)
                all_ids.append(uid)
                all_tokens.append(preprocess(embed_text))
                all_domains[uid] = meta.get("domaine", "")
        offset += page
        if len(batch["ids"]) < page:
            break

    print(f"  ChromaDB → {len(all_ids)} articles chargés")

    # Reconstruire BM25Okapi
    bm25 = BM25Okapi(all_tokens)
    with open(BM25_PATH, "wb") as f:
        pickle.dump({"bm25": bm25, "ids": all_ids, "domains": all_domains}, f)

    print(f"  ✅ BM25 reconstruit et sauvegardé ({len(all_ids)} articles)")
    print(f"     {BM25_PATH}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    do_all = "--all" in sys.argv

    if not args and not do_all:
        print(__doc__)
        sys.exit(0)

    # Charger les métadonnées
    with open(METADATA_FILE, encoding="utf-8") as f:
        metadata_map = {item["doc_id"]: item for item in json.load(f)}

    # Déterminer les doc_ids cibles
    if do_all:
        doc_ids = [f.stem for f in sorted(ARTICLES_DIR.glob("doc_*.json"))]
        print(f"Mode --all : {len(doc_ids)} documents à réingérer")
    else:
        doc_ids = args

    print(f"\nChargement du modèle d'embedding : {EMBEDDING_MODEL}")
    model = SentenceTransformer(EMBEDDING_MODEL)

    print("Connexion à ChromaDB...")
    client     = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))
    collection = client.get_collection(COLLECTION_NAME)
    print(f"  Collection '{COLLECTION_NAME}' : {collection.count()} articles")

    # Réingérer chaque document
    new_data: dict[str, tuple] = {}
    for doc_id in doc_ids:
        new_ids, new_corpus, new_domains = reingest_doc(
            doc_id, collection, model, metadata_map
        )
        if new_ids:
            new_data[doc_id] = (new_ids, new_corpus, new_domains)

    if not new_data:
        print("\nAucun document réingéré.")
        return

    # Mettre à jour l'index BM25
    rebuild_bm25(set(new_data.keys()), new_data)

    print(f"\n{'═'*60}")
    print(f"  Réingestion terminée : {len(new_data)} document(s) mis à jour")
    print(f"  ChromaDB total : {collection.count()} articles")
    print(f"  ⚠️  Redémarre le backend pour recharger le retriever en mémoire.")
    print(f"{'═'*60}")


if __name__ == "__main__":
    main()
