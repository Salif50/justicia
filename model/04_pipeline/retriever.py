"""
HybridRetriever — Retrieval de haute précision pour JusticIA

Pipeline :
  1. Query expansion  → 3 variantes de la question
  2. Semantic search  → ChromaDB (bi-encoder, sens/concept)
  3. BM25 search      → rank_bm25 (mots-clés exacts, termes juridiques)
  4. RRF Fusion       → Reciprocal Rank Fusion (combine les deux rankings)
  5. Cross-encoder    → Reranking de haute précision (score de pertinence réel)
"""

import math
import json
import pickle
import re
import time
from pathlib import Path
from typing import Optional

import chromadb
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer

# ── Chemins ───────────────────────────────────────────────────────────────────
BASE_DIR        = Path(__file__).parent.parent
VECTORSTORE_DIR = BASE_DIR / "03_vectorstore"
BM25_PATH       = VECTORSTORE_DIR / "bm25_index.pkl"
INDEX_MANIFEST  = VECTORSTORE_DIR / "active_index.json"

# ── Modèles ───────────────────────────────────────────────────────────────────
# OrdalieTech/Solon : E5-large fine-tuné droit français (+15-20% precision vs mpnet)
# Préfixe E5 obligatoire : "query:" en retrieval, "passage:" à l'ingestion
BI_ENCODER_MODEL    = "OrdalieTech/Solon-embeddings-large-0.1"
CROSS_ENCODER_MODEL = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"
COLLECTION_NAME     = "justicia_guinee"


def _active_index_config() -> tuple[str, Path, str]:
    """Retourne l'index actif sans supprimer ni modifier l'ancienne version."""
    if not INDEX_MANIFEST.is_file():
        return COLLECTION_NAME, BM25_PATH, "legacy"
    with INDEX_MANIFEST.open(encoding="utf-8") as handle:
        manifest = json.load(handle)
    collection = str(manifest.get("collection", "")).strip()
    bm25_name = str(manifest.get("bm25_path", "")).strip()
    version = str(manifest.get("version", "unknown"))
    if not collection or not bm25_name:
        raise RuntimeError("Manifest d'index actif incomplet.")
    bm25_path = VECTORSTORE_DIR / bm25_name
    if not bm25_path.is_file():
        raise RuntimeError(f"Index BM25 actif absent : {bm25_path}")
    return collection, bm25_path, version

# ── Cache retrieval ────────────────────────────────────────────────────────────
# Une question identique (ou quasi — FAQ, tests, utilisateur qui reformule puis
# revient) resservie dans la fenêtre de TTL saute tout le recalcul (embedding +
# BM25 + cross-encoder). TTL court pour ne jamais servir de résultats périmés
# si le corpus est réindexé pendant que le process tourne. Voir le plan
# "Amélioration RAG — performance + garde-fous qualité".
CACHE_TTL_SECONDS = 3600  # 1h
CACHE_MAX_SIZE    = 500   # entrées ; au-delà, éviction de la plus ancienne

# Certains domaines couvrent plusieurs codes dans le corpus.
# Ex : le divorce est dans Code Civil (tagué "Droit civil") ET Code de l'Enfant ("Droit de la famille").
# Ces alias permettent de chercher dans les deux sans re-indexer.
DOMAIN_ALIASES: dict[str, list[str]] = {
    "Droit de la famille":   ["Droit de la famille", "Droit civil"],
    "Droit pénal":           ["Droit pénal"],
    "Droit du travail":      ["Droit du travail"],
    "Droit foncier":         ["Droit foncier"],
    "Economie":              ["Economie", "Commerce et assurances", "Transport et commerce"],
    "Droit civil":           ["Droit civil", "Droit de la famille"],
    "Droit électoral":       ["Droit électoral"],
    "Droit constitutionnel": ["Droit constitutionnel", "Droit électoral"],
}

# ── Stop words français ───────────────────────────────────────────────────────
STOPWORDS_FR = set([
    "le","la","les","de","du","des","un","une","et","ou","à","au","aux","en",
    "que","qui","dans","sur","par","pour","est","sont","avec","il","elle",
    "ils","elles","se","si","ne","pas","plus","ce","cette","ces","tout",
    "tous","toute","toutes","leur","leurs","son","sa","ses","nous","vous",
    "je","tu","on","y","d","l","j","m","n","s","qu","c","a","ai","as","ont",
    "dont","car","mais","donc","or","ni","cet","tel","tels","telle","telles",
    "même","très","bien","aussi","comme","quand","alors","après","avant",
    "entre","vers","sous","lors","dès","selon",
    # NOTE : "sans" retiré intentionnellement — "sans motif", "sans préavis",
    # "sans faute" sont des locutions juridiques clés qui ne doivent pas être filtrées.
])

# ── Normalisation légale française — lemmatisation légère ─────────────────────
# Réduit les variantes morphologiques pour améliorer le rappel BM25.
# Règles ordonnées du plus spécifique au plus général pour éviter les collisions.
_LEGAL_NORM_RULES: list[tuple[str, str]] = [
    # Pluriels irréguliers juridiques
    ("travaux",        "travail"),
    ("baux",           "bail"),
    ("impôts",         "impôt"),
    ("procès",         "procès"),
    # Pluriels réguliers fréquents
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
    ("époux",          "époux"),  # invariant
    ("citoyens",       "citoyen"),
    ("électeurs",      "électeur"),
    ("candidats",      "candidat"),
    ("crimes",         "crime"),
    ("délits",         "délit"),
    ("amendes",        "amende"),
    # Formes verbales conjuguées → infinitif/nom
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
    # Variantes accentuées ↔ non accentuées
    ("preaves",        "préavis"),
    ("indemnite",      "indemnité"),
    ("heritier",       "héritier"),
    ("epoux",          "époux"),
    ("electeur",       "électeur"),
    ("election",       "élection"),
]

def _normalize_legal(token: str) -> str:
    """Normalise un token juridique : pluriels, conjugaisons, accents."""
    for variant, canonical in _LEGAL_NORM_RULES:
        if token == variant:
            return canonical
    return token


# ── Mots interrogatifs à supprimer pour la variante "statement" ──────────────
MOTS_INTERROGATIFS = [
    "qu'est-ce que ", "qu'est-ce qu'", "quels sont les ", "quelles sont les ",
    "quel est le ", "quelle est la ", "comment fonctionne ", "comment est ",
    "comment peut-on ", "comment doit-on ", "est-ce que ", "est-il possible de ",
    "peut-on ", "doit-on ", "que dit la loi sur ", "que prévoit la loi sur ",
    "que stipule ", "quelles sont les conditions pour ", "quelle est la procédure ",
    "quels sont les droits ", "quelles sont les obligations ",
    "qu'est ce que ", "qu'est ce qu'",
]


def preprocess(text: str) -> list[str]:
    """Tokenise, filtre les stop words et normalise les termes juridiques pour BM25."""
    text = text.lower()
    text = re.sub(r"[^\w\sàâäéèêëîïôùûüç]", " ", text)
    tokens = [
        t for t in text.split()
        if t not in STOPWORDS_FR and (len(t) > 2 or t.isdigit())
    ]
    return [_normalize_legal(t) for t in tokens]


# ── Extraction de passage pertinent pour le Cross-encoder ────────────────────
_SENT_SPLIT_RE = re.compile(r'(?<=[.;:»])\s+(?=[A-ZÀ-Ü«"])')

def _extract_best_passage(query: str, text: str, n_sentences: int = 4, max_chars: int = 600) -> str:
    """
    Extrait les N phrases d'un article les plus pertinentes pour la requête.
    Améliore la précision du Cross-encoder qui ne voit que 600 chars max.
    Algorithme : score BM25-like terme-par-terme par phrase.
    """
    if len(text) <= max_chars:
        return text

    query_tokens = set(preprocess(query))
    if not query_tokens:
        return text[:max_chars]

    # Découper en phrases/clauses sur ponctuation forte
    sentences = _SENT_SPLIT_RE.split(text)
    if len(sentences) <= 2:
        return text[:max_chars]

    # Scorer chaque phrase par recouvrement de tokens avec la requête
    def sent_score(s: str) -> float:
        s_tokens = set(preprocess(s))
        overlap = len(query_tokens & s_tokens)
        return overlap / (len(query_tokens) + 0.5)

    scored = sorted(enumerate(sentences), key=lambda x: sent_score(x[1]), reverse=True)
    # Garder les N meilleures phrases, dans leur ordre original
    best_indices = sorted(i for i, _ in scored[:n_sentences])
    passage = " ".join(sentences[i] for i in best_indices)
    return passage[:max_chars]


def sigmoid(x: float) -> float:
    """Normalise un score cross-encoder en [0, 1]."""
    return 1.0 / (1.0 + math.exp(-x))


def reciprocal_rank_fusion(rankings: list[list[str]], k: int = 60) -> dict[str, float]:
    """
    RRF : combine plusieurs listes de résultats classés.
    Score RRF(d) = Σ 1 / (k + rank_i(d))
    Plus le score est élevé, plus le document est pertinent.
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return scores


# Complément de résultats quand le domaine est connu (voir _finalize)
BACKFILL_MIN   = 5      # nombre minimal d'articles visé
BACKFILL_FLOOR = 0.005  # score cross-encoder (sigmoid) en dessous duquel on ne complète jamais


class HybridRetriever:
    """
    Retriever hybride :
      BM25 (keywords) + Sémantique (concepts) → RRF → Cross-encoder reranking
    """

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.collection_name, self.bm25_path, self.index_version = _active_index_config()
        self._log("Chargement du bi-encoder...")
        self.bi_encoder = SentenceTransformer(BI_ENCODER_MODEL)

        self._log("Connexion ChromaDB...")
        client = chromadb.PersistentClient(path=str(VECTORSTORE_DIR))
        self.collection = client.get_collection(self.collection_name)

        self._log("Chargement de l'index BM25...")
        with open(self.bm25_path, "rb") as f:
            bm25_data = pickle.load(f)
        self.bm25: BM25Okapi  = bm25_data["bm25"]
        self.bm25_ids: list   = bm25_data["ids"]
        self.bm25_domains     = bm25_data["domains"]

        vector_count = self.collection.count()
        lexical_count = len(self.bm25_ids)
        if vector_count != lexical_count:
            raise RuntimeError(
                "Index juridique désynchronisé: "
                f"ChromaDB={vector_count}, BM25={lexical_count}. "
                "Relancez model/02_ingestion/ingest.py avant de servir des réponses."
            )
        vector_ids = set(self.collection.get(include=[]).get("ids", []))
        lexical_ids = set(self.bm25_ids)
        if vector_ids != lexical_ids:
            raise RuntimeError(
                "Identifiants d'index juridique désynchronisés: "
                f"BM25 seulement={len(lexical_ids - vector_ids)}, "
                f"ChromaDB seulement={len(vector_ids - lexical_ids)}. "
                "Relancez model/02_ingestion/ingest.py avant de servir des réponses."
            )

        self._log("Chargement du cross-encoder...")
        self.cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL)

        self._log(f"✅ Retriever prêt — {vector_count} articles indexés et synchronisés.")
        self._cache_namespace = (
            f"{BI_ENCODER_MODEL}|{CROSS_ENCODER_MODEL}|{vector_count}|"
            f"{self.index_version}|{self.bm25_path.stat().st_mtime_ns}"
        )

        # cache_key -> (timestamp, résultat). Voir CACHE_TTL_SECONDS/CACHE_MAX_SIZE.
        self._cache: dict[tuple, tuple[float, list[dict]]] = {}

    def _log(self, msg: str):
        if self.verbose:
            print(msg)

    def _cache_key(self, question: str, domaine, top_k, n_candidates, score_threshold) -> tuple:
        return (
            self._cache_namespace,
            question.strip().lower(),
            domaine,
            top_k,
            n_candidates,
            score_threshold,
        )

    def _cache_get(self, key: tuple) -> Optional[list[dict]]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        ts, value = entry
        if time.time() - ts > CACHE_TTL_SECONDS:
            del self._cache[key]
            return None
        return value

    def _cache_set(self, key: tuple, value: list[dict]) -> None:
        if len(self._cache) >= CACHE_MAX_SIZE and key not in self._cache:
            oldest_key = min(self._cache, key=lambda k: self._cache[k][0])
            del self._cache[oldest_key]
        self._cache[key] = (time.time(), value)

    @property
    def article_count(self) -> int:
        return self.collection.count()

    # ── Recherche sémantique ─────────────────────────────────────────────────
    def _semantic_search(self, query: str, n: int, domains: Optional[list[str]]) -> list[str]:
        # Préfixe "query:" requis par le modèle E5/Solon pour l'asymétrie query/passage
        embedding = self.bi_encoder.encode(
            f"query: {query}",
            normalize_embeddings=True,
        ).tolist()
        if domains and len(domains) == 1:
            where: Optional[dict] = {"domaine": domains[0]}
        elif domains and len(domains) > 1:
            where = {"domaine": {"$in": domains}}
        else:
            where = None
        results = self.collection.query(
            query_embeddings=[embedding],
            n_results=min(n, self.collection.count()),
            where=where,
            include=["metadatas", "distances"],
        )
        return results["ids"][0]

    # ── Recherche BM25 ───────────────────────────────────────────────────────
    def _bm25_search(self, query: str, n: int, domains: Optional[list[str]]) -> list[str]:
        tokens = preprocess(query)
        if not tokens:
            return []

        scores = self.bm25.get_scores(tokens).copy()

        # Filtrer par domaine(s) si précisé
        if domains:
            domain_set = set(domains)
            for i, uid in enumerate(self.bm25_ids):
                if self.bm25_domains.get(uid, "") not in domain_set:
                    scores[i] = 0.0

        top_indices = np.argsort(scores)[::-1][:n]
        return [self.bm25_ids[i] for i in top_indices if scores[i] > 0.0]

    # ── Query expansion ──────────────────────────────────────────────────────
    def _expand_queries(self, question: str) -> list[str]:
        """
        Génère 3 variantes de la question pour maximiser le recall :
          1. Question originale (capture l'intention complète)
          2. Question sans mots interrogatifs (meilleure correspondance BM25)
          3. Mots-clés extraits (recherche par termes juridiques spécifiques)
        """
        queries = [question]

        # Variante 2 : supprimer les formulations interrogatives
        q_lower   = question.lower()
        statement = question
        for mot in MOTS_INTERROGATIFS:
            if q_lower.startswith(mot):
                statement = question[len(mot):].strip(" ?.,")
                break
        if statement != question and len(statement) > 10:
            queries.append(statement)

        # Variante 3 : mots-clés optimisés pour cross-encoder (6-8 termes juridiques clés)
        # On utilise la variante statement (sans mots interrogatifs) comme base
        # et on filtre les termes géographiques/généraux qui diluent la précision CE
        _GEO_TERMS = {
            "guinee", "guinée", "guinea",
            "republique", "république",
            "afrique", "africain", "africaine",
            "conakry",
            "guineen", "guinéen", "guinéenne",
        }
        base_text = statement if statement != question else question
        tokens = [t for t in preprocess(base_text) if t not in _GEO_TERMS]
        if len(tokens) >= 3:
            kw_query = " ".join(tokens[:8])  # Max 8 termes juridiques
            if kw_query not in queries:
                queries.append(kw_query)

        return queries

    # ── Pipeline de retrieval complet ────────────────────────────────────────
    def _gather_candidates(
        self,
        question:     str,
        domaine:      Optional[str],
        n_candidates: int,
    ) -> tuple[list[str], dict, dict, str]:
        """
        Étapes 1-4 de retrieve() : expansion, recherche sémantique + BM25, fusion RRF,
        récupération des métadonnées. Ne fait AUCUN appel au cross-encoder — c'est ce
        qui permet de le batcher séparément (voir retrieve_multi).

        Retourne (candidates, rrf_scores, id_to_data, ce_query).
        """
        effective_domains: Optional[list[str]] = None
        if domaine:
            effective_domains = DOMAIN_ALIASES.get(domaine, [domaine])

        queries = self._expand_queries(question)

        if self.verbose:
            print(f"\n  Domaines actifs : {effective_domains or 'tous'}")
            print(f"  Query expansion : {len(queries)} variante(s)")
            for q in queries:
                print(f"    • {q[:80]}")

        # 1 seule recherche sémantique (Solon, coûteuse) sur la question originale —
        # les variantes BM25 couvrent le reste.
        sem_ids = self._semantic_search(question, n=n_candidates, domains=effective_domains)
        all_rankings = [sem_ids]

        for q in queries:
            bm25_ids = self._bm25_search(q, n=n_candidates, domains=effective_domains)
            all_rankings.append(bm25_ids)

        rrf_scores = reciprocal_rank_fusion(all_rankings)
        candidates = sorted(rrf_scores, key=lambda x: rrf_scores[x], reverse=True)
        candidates = candidates[:n_candidates]

        if self.verbose:
            print(f"  Candidats après RRF : {len(candidates)}")

        id_to_data: dict = {}
        if candidates:
            results = self.collection.get(ids=candidates, include=["metadatas", "documents"])
            id_to_data = {
                rid: {"meta": results["metadatas"][i], "doc": results["documents"][i]}
                for i, rid in enumerate(results["ids"])
            }

        # IMPORTANT : le modèle mmarco est entraîné sur des requêtes courtes (MSMARCO).
        # On préfère la variante STATEMENT (queries[1] : sans mots interrogatifs) :
        # elle est plus courte que la question complète ET conserve le sujet juridique
        # clé (ex : "électeur" vs "candidat") que la variante mots-clés peut supprimer.
        ce_query = queries[1] if len(queries) >= 2 else question

        return candidates, rrf_scores, id_to_data, ce_query

    def _build_ce_pairs(
        self,
        ce_query:   str,
        candidates: list[str],
        id_to_data: dict,
    ) -> tuple[list[list[str]], list[str]]:
        """Construit les paires [requête, passage] pour le cross-encoder (étape 5a,
        sans appeler le modèle — c'est le point de batching)."""
        pairs, valid_ids = [], []
        for rid in candidates:
            if rid not in id_to_data:
                continue
            meta  = id_to_data[rid]["meta"]
            texte = meta.get("texte", id_to_data[rid]["doc"])
            # Extraction de passage : sélectionner les phrases les plus pertinentes
            # plutôt que de tronquer aveuglément à 600 chars (améliore la précision CE)
            passage = _extract_best_passage(ce_query, texte, n_sentences=4, max_chars=600)
            pairs.append([ce_query, passage])
            valid_ids.append(rid)
        return pairs, valid_ids

    def _finalize(
        self,
        valid_ids:       list[str],
        ce_raw_scores,
        id_to_data:      dict,
        rrf_scores:      dict,
        domaine:         Optional[str],
        score_threshold: Optional[float],
        top_k:           int,
    ) -> list[dict]:
        """Étapes 6-7 de retrieve() : assemblage, tri, seuil adaptatif, dédoublonnage."""
        articles = []
        for rid, raw_score in zip(valid_ids, ce_raw_scores):
            meta  = id_to_data[rid]["meta"]
            score = sigmoid(float(raw_score))  # normalisation → [0, 1]

            articles.append({
                "id":          rid,
                "article_ref": meta.get("article_ref", ""),
                "titre":       meta.get("titre", ""),
                "chapitre":    meta.get("chapitre", ""),
                "section":     meta.get("section", ""),
                "texte":       meta.get("texte", ""),
                "nom_doc":     meta.get("nom", ""),
                "domaine":     meta.get("domaine", ""),
                "type_doc":    meta.get("type_doc", ""),
                "numero":      meta.get("numero", ""),
                "date":        meta.get("date", ""),
                "source":      meta.get("source", ""),
                "source_url":  meta.get("source_url", ""),
                "source_file": meta.get("source_file", ""),
                "source_status": meta.get("source_status", "inconnu"),
                "page":        meta.get("page", ""),
                "score":       round(score, 4),
                "rrf_score":   round(rrf_scores.get(rid, 0.0), 6),
            })

        articles.sort(key=lambda x: x["score"], reverse=True)

        # Filtrage adaptatif :
        # Le cross-encoder mmarco (anglais/MSMARCO) sous-estime systématiquement
        # les articles juridiques français → seuils abaissés en conséquence.
        # Le filtre de domaine (garantie thématique) permet d'être plus permissif.
        #
        # Seuil domaine recalibré le 2026-09-08 (0.15 → 0.05) : validé contre
        # model/04_pipeline/test_exactitude.py — à 0.15, l'article correct était
        # présent dans les 30 candidats RRF, bien classé, mais rejeté par ce
        # filtre (score sigmoid ~0.07-0.12 pour des réponses vérifiées comme
        # correctes, ex. Art 172.23/172.24 pour le préavis, Art 22 pour la
        # légitime défense) — 2 des 5 cas vérifiés ne renvoyaient AUCUN résultat.
        # À 0.06 et en dessous, les 5 cas passent. Voir le plan
        # "Amélioration RAG — performance + garde-fous qualité" pour le détail.
        # Ne pas remonter ce seuil sans revalider test_exactitude.py.
        if score_threshold is not None:
            threshold = score_threshold
        elif domaine is not None:
            threshold = 0.05  # domaine connu → le filtre garantit la pertinence
        else:
            threshold = 0.28  # sans domaine → inchangé, non revalidé (pas de vérité terrain sans domaine)
        passed = [a for a in articles if a["score"] > threshold]

        # Complément lorsque le domaine est connu (ajout 2026-10-04) :
        # le cross-encoder mmarco sous-note le français juridique au point de
        # rejeter des articles corrects (ex. Art 121.6 « période d'essai » noté
        # 0.013 alors qu'il contient la réponse exacte). Plutôt que d'abaisser le
        # seuil pour tout le monde, on complète jusqu'à BACKFILL_MIN articles avec
        # les suivants du MÊME domaine (filtre déjà appliqué), au-dessus d'un
        # plancher, marqués `_backfill` pour que rag.py signale la faible confiance.
        # Validé contre test_exactitude.py (aucune régression).
        if score_threshold is None and domaine is not None and len(passed) < BACKFILL_MIN:
            kept = {a["id"] for a in passed}
            for art in articles:
                if len(passed) >= BACKFILL_MIN:
                    break
                if art["id"] not in kept and art["score"] >= BACKFILL_FLOOR:
                    passed.append({**art, "_backfill": True})
        articles = passed

        # Dédoublonnage (évite de citer deux fois le même texte)
        seen, deduped = set(), []
        for art in articles:
            key = art["texte"][:100].strip()
            if key not in seen:
                seen.add(key)
                deduped.append(art)

        return deduped[:top_k]

    def retrieve(
        self,
        question:     str,
        domaine:      Optional[str] = None,
        top_k:        int = 10,
        n_candidates: int = 30,
        score_threshold: Optional[float] = None,
    ) -> list[dict]:
        """
        Retourne les top_k articles les plus pertinents pour UNE question.

        Étapes :
          1. Résolution des domaines avec aliases (ex: famille → famille + civil)
          2. 1 seule recherche sémantique Solon (coûteuse) sur la question originale
          3. 3 recherches BM25 (rapides) sur les variantes de la question
          4. RRF Fusion de tous les rankings
          5. Récupération des métadonnées (ChromaDB)
          6. Cross-encoder reranking
          7. Dédoublonnage et retour du top_k

        Pour reranker plusieurs formulations d'une même question en un seul appel
        cross-encoder (plus rapide), voir retrieve_multi().

        Résultat mis en cache CACHE_TTL_SECONDS (question+domaine+top_k identiques
        → pas de recalcul).
        """
        cache_key = self._cache_key(question, domaine, top_k, n_candidates, score_threshold)
        cached = self._cache_get(cache_key)
        if cached is not None:
            if self.verbose:
                print("  (résultat servi depuis le cache)")
            return cached

        candidates, rrf_scores, id_to_data, ce_query = self._gather_candidates(
            question, domaine, n_candidates
        )
        if not candidates:
            self._cache_set(cache_key, [])
            return []

        pairs, valid_ids = self._build_ce_pairs(ce_query, candidates, id_to_data)
        if not pairs:
            self._cache_set(cache_key, [])
            return []

        ce_raw_scores = self.cross_encoder.predict(pairs)

        if self.verbose:
            print(f"  Cross-encoder appliqué sur {len(pairs)} candidats.")

        result = self._finalize(
            valid_ids, ce_raw_scores, id_to_data, rrf_scores,
            domaine, score_threshold, top_k,
        )
        self._cache_set(cache_key, result)
        return result

    def retrieve_multi(
        self,
        questions:    list[str],
        domaine:      Optional[str] = None,
        top_k:        int = 10,
        n_candidates: int = 30,
        score_threshold: Optional[float] = None,
    ) -> list[list[dict]]:
        """
        Équivalent à appeler retrieve() séparément pour chaque question de la liste,
        MAIS avec un seul appel batché au cross-encoder au lieu d'un par question —
        c'est l'étape la plus coûteuse du pipeline (voir plan "Amélioration RAG —
        performance"). Les candidats RRF et les scores restent identiques à
        retrieve() (mêmes recherches sémantique/BM25 par question, juste le
        cross-encoder qui est mutualisé) : mêmes résultats, plus rapide.

        Retourne une liste de résultats, un par question, dans le même ordre.
        Les questions déjà en cache (voir retrieve()) ne participent pas au batch
        cross-encoder — seuls les cache-miss sont calculés.
        """
        if not questions:
            return []

        # Résoudre le cache d'abord : seuls les cache-miss seront batchés.
        results: list[Optional[list[dict]]] = [None] * len(questions)
        cache_keys = [
            self._cache_key(q, domaine, top_k, n_candidates, score_threshold)
            for q in questions
        ]
        miss_indices = []
        for i, key in enumerate(cache_keys):
            cached = self._cache_get(key)
            if cached is not None:
                results[i] = cached
            else:
                miss_indices.append(i)

        if self.verbose and len(miss_indices) < len(questions):
            print(f"  ({len(questions) - len(miss_indices)}/{len(questions)} question(s) servies depuis le cache)")

        if not miss_indices:
            return results  # tout venait du cache

        if len(miss_indices) == 1:
            i = miss_indices[0]
            results[i] = self.retrieve(questions[i], domaine, top_k, n_candidates, score_threshold)
            return results

        per_question: list[dict] = []
        all_pairs:    list[list[str]] = []

        for i in miss_indices:
            candidates, rrf_scores, id_to_data, ce_query = self._gather_candidates(
                questions[i], domaine, n_candidates
            )
            pairs, valid_ids = ([], [])
            if candidates:
                pairs, valid_ids = self._build_ce_pairs(ce_query, candidates, id_to_data)

            start = len(all_pairs)
            all_pairs.extend(pairs)
            per_question.append({
                "index":      i,
                "rrf_scores": rrf_scores,
                "id_to_data": id_to_data,
                "valid_ids":  valid_ids,
                "slice":      slice(start, start + len(pairs)),
            })

        if not all_pairs:
            for q in per_question:
                results[q["index"]] = []
                self._cache_set(cache_keys[q["index"]], [])
            return results

        ce_raw_scores = self.cross_encoder.predict(all_pairs)

        if self.verbose:
            print(f"  Cross-encoder batché : {len(all_pairs)} paires pour {len(miss_indices)} question(s) (cache-miss).")

        for q in per_question:
            scores_slice = ce_raw_scores[q["slice"]]
            result = self._finalize(
                q["valid_ids"], scores_slice, q["id_to_data"], q["rrf_scores"],
                domaine, score_threshold, top_k,
            )
            results[q["index"]] = result
            self._cache_set(cache_keys[q["index"]], result)

        return results
