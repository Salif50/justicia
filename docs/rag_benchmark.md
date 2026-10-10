# Benchmark RAG JusticIA

Ce fichier est un protocole et un espace de résultats. Aucun résultat n'est renseigné sans exécution reproductible.

## Commandes

    ./backend/env/bin/python model/02_ingestion/audit_corpus.py --check-indexes
    ./backend/env/bin/python model/test_pipeline.py --retriever-only

Le benchmark applicatif doit utiliser un environnement configuré, un index figé et un modèle explicitement indiqués. Séparer démarrage à froid et régime chaud.

## Jeu de référence

Le fichier model/evaluation/rag_reference.jsonl contient uniquement des cas synthétiques à faire valider. expected_source_ids et required_points restent vides tant qu'un juriste n'a pas vérifié les réponses attendues.

Mesures à renseigner :

| Exécution | Corpus | Embedding | Reranker | LLM | Cas | Recall@K | MRR | preuve dans contexte final | refus incorrect | p50 ms | p95 ms | erreurs |
|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| non exécutée | — | — | — | — | — | — | — | — | — | — | — | — |

Ne pas convertir un score de reranking en pourcentage de vérité juridique. Publier aussi les cas échoués et la catégorie de l'échec.
