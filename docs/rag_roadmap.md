# Roadmap RAG JusticIA

Les états « implémenté » décrivent le code ; ils ne valent pas validation juridique.

| Priorité | Tâche | État | Preuve / prochaine action |
|---|---|---|---|
| P0 | Audit reproductible du corpus et des index | implémenté | model/02_ingestion/audit_corpus.py |
| P0 | Synchronisation BM25/ChromaDB | implémenté et vérifié | index actif versionné `20261003T163243Z`, 12 150 identifiants identiques |
| P0 | Registre et résolution des citations | implémenté dans le code | marqueurs S1..Sn, refus si marqueur inconnu ou absent |
| P0 | Traces de latence sans contenu sensible | implémenté dans le code | request_id, temps retrieval/LLM/validation |
| P0 | Jeu de référence revu par un juriste | à faire | renseigner model/evaluation/rag_reference.jsonl |
| P1 | Références explicites document + article + version | en cours | recherche lexicale enrichie ; ajouter tests avec suffixes |
| P1 | OCR et structure article/alinéa | partiellement traité | `doc_022` et `doc_034` extraits par OCR ; statut `ocr_a_reviser` jusqu’à relecture juridique |
| P1 | Sélection du contexte et parenté des articles | à mesurer | benchmark Recall@K/MRR/nDCG |
| P1 | Baseline p50/p95 chaud/froid | à faire | utiliser docs/rag_benchmark.md |
| P2 | Statut, entrée en vigueur et abrogations | à valider juridiquement | compléter avec preuves officielles |
| P2 | Migration versionnée et rollback | implémenté dans le code | staging, manifeste actif et activation par version ; ancien index conservé |
| P2 | Feedback source incorrecte / réponse incomplète | à faire | extension API compatible à spécifier |

## Bloquants avant production

- Aucun résultat de pertinence ne doit être annoncé avant la revue des cas par un juriste guinéen.
- Les PDF non référencés doivent être identifiés avant de les indexer.
- Une réindexation complète doit réussir l'audit avec des identifiants BM25/ChromaDB identiques.
