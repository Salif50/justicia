# Moteur IA JusticIA

Tout ce qui fait fonctionner les réponses juridiques : les textes de loi, leur
indexation et la recherche hybride (RAG). Le modèle de langage n'est pas entraîné :
il rédige uniquement à partir des articles retrouvés, et chaque citation est vérifiée.
Le backend charge ce dossier via `RAG_MODEL_PATH` (par défaut : ce dossier ;
dans Docker : `/app/model`, monté en lecture seule).

```
model/
├── corpus/            Source de vérité : textes de loi guinéens
│   ├── pdfs/          PDF officiels (non envoyés en production)
│   ├── articles/      un JSON par texte, découpé article par article
│   ├── metadata.json  catalogue des textes (nom, numéro, date, domaine, statut, source)
│   ├── jurisprudence/ decisions.json : décisions structurées (Cour suprême, CCJA, CA, TPI)
│   ├── journal_officiel/ numeros.json : sommaires du JO, chaque entrée reliée à son texte
│   ├── relations.json liens entre textes (modifie, abroge, applique, cite) repérés dans les articles
│   ├── guides/        creation_entreprise.json (guichet unique APIP/GDB)
│   ├── sources/       identifiants stables des textes collectés
│   ├── reports/       rapport d'harmonisation (à faire relire par un juriste)
│   └── corpus.jsonl   ancien export (non utilisé par l'ingestion)
├── 02_ingestion/      corpus → index : ingest.py (complet + jurisprudence), reingest_doc.py (un texte),
│                      import_droitguineen.py (intègre la collecte data/droitguineen),
│                      import_textes.py (lois, décrets, arrêtés, JO), test_import.py,
│                      rebuild_bm25.py, audit_corpus.py, extract_ocr_articles.py
├── 03_vectorstore/    index générés : ChromaDB (sémantique) + BM25 (mots-clés)
├── 04_pipeline/       moteur de réponse
│   ├── retriever.py   recherche hybride + reranking cross-encoder
│   ├── rag.py         détection du domaine, prompt, appel LLM, garde-fous de citation
│   ├── test_exactitude.py  vérité terrain : la bonne loi est-elle retrouvée ?
│   ├── test_guards.py      garde-fous anti-invention (sans appel LLM)
│   └── test_qualite.py     contrôle de forme des réponses
├── evaluation/        rag_reference.jsonl : jeu de questions de référence (à faire valider par un juriste)
├── scripts/           raccourcis : ingest.sh, test_retrieval.sh, test_pipeline_*.sh
├── test_pipeline.py   test de bout en bout (recherche + LLM)
└── .env               clés LLM pour les scripts du moteur (voir .env.example)
```

Seuls `corpus/metadata.json`, `03_vectorstore/` et `04_pipeline/` sont nécessaires
en production.

## Modèle de langage

Choisi dans `backend/.env` (ou `deploy/.env`) — aucun entraînement, on change juste de fournisseur :

| `LLM_PROVIDER` / `RAG_LLM_PROVIDER` | Modèle | Remarques |
|---|---|---|
| `openai` | `OPENAI_MODEL` (gpt-4o) | Par défaut. Rapide (~10 s). Les questions partent chez OpenAI. |
| `ollama` | `OLLAMA_MODEL` (qwen2.5:14b) | 100 % local et confidentiel. Lent sur Mac (~1–2 min). Pas disponible sur le VPS actuel. |

Basculer en local : `ollama pull qwen2.5:14b`, puis mettre les deux variables à `ollama`
et redémarrer le backend.

## Ajouter ou corriger un texte de loi

1. Déposer le PDF dans `corpus/pdfs/` et produire son JSON dans `corpus/articles/`.
2. Réindexer : `./model/scripts/ingest.sh` (complet) ou
   `backend/env/bin/python model/02_ingestion/reingest_doc.py <doc_id>`.
3. Vérifier qu'aucune réponse n'a régressé :
   ```bash
   cd model/04_pipeline
   ../../backend/env/bin/python test_exactitude.py
   ../../backend/env/bin/python -m unittest test_guards.py
   ```
4. Redémarrer l'API (en Docker : `docker compose restart api`).

## Collecte droitguineen.com

La collecte brute vit dans `data/droitguineen/` (non versionnée). Pour l'intégrer :

```bash
backend/env/bin/python model/02_ingestion/import_droitguineen.py --report-only   # rapport seul
backend/env/bin/python model/02_ingestion/import_droitguineen.py                 # écrit le corpus
backend/env/bin/python model/02_ingestion/ingest.py --version <id>               # staging (GPU si dispo)
# tests (test_exactitude, test_guards) contre le staging, puis :
backend/env/bin/python model/02_ingestion/ingest.py --activate-version <id>
```

Le script repart toujours du corpus validé (`BASELINE_REF`) et ne rédige rien :
- même loi déjà présente → nos articles sont gardés ; on ajoute les manquants, on retire
  le bruit de mise en page (en-têtes du JO), on corrige l'OCR seulement si la version
  collectée a moins de mots anormaux et n'est pas plus courte ;
- textes abrogés (preuve : disposition abrogatoire citée), projets, versions historiques
  et doublons restent dans le catalogue avec leur statut mais **ne sont plus indexés** ;
- chaque écart non résolu est listé dans `corpus/reports/harmonisation_droitguineen.md`.

Identifiants : `doc_001`–`doc_999` pour les codes, lois et guides ; `doc_1001`+ pour les
textes officiels (lois, décrets, arrêtés…). Chaque texte officiel a une **famille** :

| Famille | Exemples | Indexée pour répondre |
|---|---|---|
| loi, constitution, traité, convention | lois, ordonnances, Traité OHADA, règlements CCJA | oui |
| réglementaire | décrets et arrêtés « fixant les modalités… » | oui |
| organisation | création, attributions d'organismes | oui |
| individuel | nominations, agréments, permis, promotions | non (consultable) |
| ratification, promulgation | accords de prêt, décrets de promulgation | non (consultable) |

Un texte dont le corps ne correspond pas au titre (erreur de la source) ou dont le début
manque n'est pas indexé ; il reste consultable avec un avertissement. Les pages « texte
intégral » servent de seconde source : articles manquants, plages « Art. 8 à 12. Abrogés »,
articles tronqués complétés.

La jurisprudence a son propre index (`justicia_jurisprudence_<version>`) : elle ne modifie
jamais le classement des articles. Dans une réponse, la section « Jurisprudence » est
contrôlée à part (décision fournie, citation exacte, aucun numéro d'article absent du
passage) et retirée au moindre doute ; les extraits restent affichés tels quels.

## Batterie de questions réelles (de bout en bout)

`evaluation/batterie_reelle.json` : 36 questions formulées comme un usager (pénal, travail,
famille, foncier, OHADA, fiscal, douane, route, santé, numérique, décret de 2026, guide
APIP, jurisprudence) et des pièges (article inexistant, droit étranger, hors sujet, textes
abrogés). Chaque réponse attendue a été vérifiée dans le texte (champ `verifie`).

```bash
backend/env/bin/python model/evaluation/run_batterie.py --token <jeton>   # API lancée sur :8000
```

Contrôles : article attendu parmi les articles cités, chiffre clé présent, aucun texte
abrogé ou projet cité, pièges sans source ni invention, jurisprudence jointe quand attendue.
Dernier résultat (2026-11-07) : 36/36 — `evaluation/resultats_batterie.json`.

## Règle d'or

Toute modification de `retriever.py` ou `rag.py` se valide **avant/après** avec
`test_exactitude.py` : un article attendu qui disparaît bloque la modification.
Chaque cas de ce fichier a été vérifié en lisant le texte réel de la loi.
