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
│   ├── corpus.jsonl   corpus complet
│   └── metadata.json  catalogue des textes (nom, numéro, date, domaine)
├── 02_ingestion/      corpus → index : ingest.py (complet), reingest_doc.py (un texte),
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

## Règle d'or

Toute modification de `retriever.py` ou `rag.py` se valide **avant/après** avec
`test_exactitude.py` : un article attendu qui disparaît bloque la modification.
Chaque cas de ce fichier a été vérifié en lisant le texte réel de la loi.
