# Documentation JusticIA

Les guides d'installation et de déploiement sont à côté du code :
[README racine](../README.md) · [deploy/](../deploy/README.md) · [model/](../model/README.md) · [frontend/](../frontend/README.md)

## Produit
- [ROADMAP.md](ROADMAP.md) — feuille de route et recommandations produit
- [PROCHAINES_ETAPES_JUSTICIA.md](PROCHAINES_ETAPES_JUSTICIA.md) — état du projet
- [paiement.md](paiement.md) — intégration Mosagix Pay
- admin.md — ⚠️ contient des identifiants en clair (ignoré par Git), à supprimer après changement du mot de passe

## Moteur IA (RAG)
- [corpus_pipeline.md](corpus_pipeline.md) — pipeline documentaire et rollback
- [rag_audit.md](rag_audit.md) · [rag_benchmark.md](rag_benchmark.md) · [rag_roadmap.md](rag_roadmap.md)
- [RECOMMANDATIONS_CODEX.md](RECOMMANDATIONS_CODEX.md) — plan d'amélioration du RAG
- [QUESTIONS_TEST.md](QUESTIONS_TEST.md) — questions de test
- [OLLAMA_SETUP.md](OLLAMA_SETUP.md) — basculer sur le modèle local Qwen (Ollama)

## Archives
- [ARCHITECTURE_ANCIENNE.md](ARCHITECTURE_ANCIENNE.md) — ancienne arborescence (avant la réorganisation
  du 4 octobre 2026 : `corpus/` est désormais dans `model/`, `training/` a été supprimé (fine-tuning abandonné), `web/` est devenu `frontend/`)
