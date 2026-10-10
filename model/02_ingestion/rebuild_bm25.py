"""
Reconstruction rapide du seul index BM25 — sans re-encoder ChromaDB.
À lancer après toute modification de la fonction preprocess() dans retriever.py.

Usage :
    cd /Users/xhalif/Desktop/IA/JusticIA/model
    source ../backend/env/bin/activate
    python 02_ingestion/rebuild_bm25.py
"""

import json
import pickle
import re
from pathlib import Path

from rank_bm25 import BM25Okapi

# ── Chemins (mêmes que ingest.py) ────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent
CORPUS_DIR      = BASE_DIR / "corpus"
ARTICLES_DIR    = CORPUS_DIR / "articles"
METADATA_FILE   = CORPUS_DIR / "metadata.json"
VECTORSTORE_DIR = BASE_DIR / "03_vectorstore"
BM25_PATH       = VECTORSTORE_DIR / "bm25_index.pkl"

# ── Stop words (identique à retriever.py) ────────────────────────────────────
STOPWORDS_FR = set([
    "le","la","les","de","du","des","un","une","et","ou","à","au","aux","en",
    "que","qui","dans","sur","par","pour","est","sont","avec","il","elle",
    "ils","elles","se","si","ne","pas","plus","ce","cette","ces","tout",
    "tous","toute","toutes","leur","leurs","son","sa","ses","nous","vous",
    "je","tu","on","y","d","l","j","m","n","s","qu","c","a","ai","as","ont",
    "dont","car","mais","donc","or","ni","cet","tel","tels","telle","telles",
    "même","très","bien","aussi","comme","quand","alors","après","avant",
    "entre","vers","sous","lors","dès","selon",
])

# ── Normalisation légale (identique à retriever.py) ──────────────────────────
_LEGAL_NORM_RULES: list[tuple[str, str]] = [
    ("travaux",        "travail"),
    ("baux",           "bail"),
    ("impôts",         "impôt"),
    ("articles",       "article"),
    ("infractions",    "infraction"),
    ("sanctions",      "sanction"),
    ("peines",         "peine"),
    ("obligations",    "obligation"),
    ("conditions",     "condition"),
    ("droits",         "droit"),
    ("indemnités",     "indemnité"),
    ("salariés",       "salarié"),
    ("employeurs",     "employeur"),
    ("contrats",       "contrat"),
    ("licenciements",  "licenciement"),
    ("héritiers",      "héritier"),
    ("enfants",        "enfant"),
    ("citoyens",       "citoyen"),
    ("électeurs",      "électeur"),
    ("candidats",      "candidat"),
    ("crimes",         "crime"),
    ("délits",         "délit"),
    ("amendes",        "amende"),
    ("licencié",       "licenciement"),
    ("licenciée",      "licenciement"),
    ("licencier",      "licenciement"),
    ("divorcer",       "divorce"),
    ("divorcé",        "divorce"),
    ("divorçant",      "divorce"),
    ("hériter",        "héritage"),
    ("hérite",         "héritage"),
    ("condamné",       "condamnation"),
    ("condamner",      "condamnation"),
    ("emprisonner",    "emprisonnement"),
    ("emprisonné",     "emprisonnement"),
    ("arrêter",        "arrestation"),
    ("arrêté",         "arrestation"),
    ("expulser",       "expulsion"),
    ("expulsé",        "expulsion"),
    ("voter",          "vote"),
    ("voté",           "vote"),
    ("inscrire",       "inscription"),
    ("inscrit",        "inscription"),
    ("preaves",        "préavis"),
    ("indemnite",      "indemnité"),
    ("heritier",       "héritier"),
    ("epoux",          "époux"),
    ("electeur",       "électeur"),
    ("election",       "élection"),
]
_NORM_MAP = {v: c for v, c in _LEGAL_NORM_RULES}


def _normalize_legal(token: str) -> str:
    return _NORM_MAP.get(token, token)


def preprocess(text: str) -> list[str]:
    """Même fonction que retriever.py — doit rester strictement synchronisée."""
    text = text.lower()
    text = re.sub(r"[^\w\sàâäéèêëîïôùûüç]", " ", text)
    tokens = [
        t for t in text.split()
        if t not in STOPWORDS_FR and (len(t) > 2 or t.isdigit())
    ]
    return [_normalize_legal(t) for t in tokens]


def load_metadata() -> dict:
    with open(METADATA_FILE, encoding="utf-8") as f:
        items = json.load(f)
    return {item["doc_id"]: item for item in items}


def rebuild_bm25():
    print("═" * 60)
    print("  Reconstruction de l'index BM25 — JusticIA")
    print("═" * 60)

    metadata_map = load_metadata()
    data_files   = sorted(ARTICLES_DIR.glob("doc_*.json"))
    print(f"  Corpus : {len(data_files)} fichiers\n")

    bm25_ids:     list = []
    bm25_corpus:  list = []
    bm25_domains: dict = {}
    total_arts         = 0

    for data_file in data_files:
        doc_id  = data_file.stem
        meta    = metadata_map.get(doc_id, {})
        domaine = meta.get("domaine", "")
        try:
            with open(data_file, encoding="utf-8") as f:
                articles = json.load(f)
        except Exception as e:
            print(f"  ⚠ {doc_id} illisible ({e}) — ignoré.")
            continue

        count = 0
        for i, art in enumerate(articles):
            texte = art.get("texte", "").strip()
            if not texte:
                continue

            # UID IDENTIQUE à ingest.py — obligatoire pour que BM25 et ChromaDB se correspondent
            uid = art.get("id") or f"{doc_id}_art_{i:04d}"

            hierarchy = " ".join(filter(None, [
                meta.get("nom", ""), meta.get("numero", ""),
                art.get("article_ref", ""), art.get("partie", ""),
                art.get("livre", ""), art.get("division", ""),
                art.get("titre", ""), art.get("sous_titre", ""),
                art.get("chapitre", ""), art.get("section", ""),
                art.get("sous_section", ""), texte,
            ]))
            tokens = preprocess(hierarchy)
            bm25_ids.append(uid)
            bm25_corpus.append(tokens)
            bm25_domains[uid] = domaine
            total_arts += 1
            count += 1

        print(f"  ✓ {doc_id:12} — {meta.get('nom', '?')[:45]:<45} — {count} articles")

    print(f"\n  Total : {total_arts} articles tokenisés")
    print(f"\n  Construction BM25Okapi...")
    bm25_index = BM25Okapi(bm25_corpus)

    BM25_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(BM25_PATH, "wb") as f:
        pickle.dump({
            "bm25":    bm25_index,
            "ids":     bm25_ids,
            "domains": bm25_domains,
        }, f)

    size_kb = BM25_PATH.stat().st_size // 1024
    print(f"\n  Index sauvegardé → {BM25_PATH} ({size_kb} KB)")
    print(f"✅ BM25 reconstruit — {total_arts} articles, UIDs compatibles ChromaDB.")


if __name__ == "__main__":
    rebuild_bm25()
