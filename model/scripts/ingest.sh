#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 1 — Réindexation complète du corpus juridique
#  Durée : 20-40 min (téléchargement Solon ~1.3 GB + embedding 12 614 articles)
#  À relancer chaque fois que tu modifies un fichier dans corpus/articles/
# ══════════════════════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # racine du projet

# Modèles déjà en cache — pas besoin de contacter le HuggingFace Hub
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
PYTHON="$ROOT/backend/env/bin/python3"
INGEST="$ROOT/model/02_ingestion/ingest.py"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  JusticIA — Réindexation corpus RAG      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Python  : $PYTHON"
echo "  Script  : $INGEST"
echo "  Corpus  : $ROOT/model/corpus/articles/ (32 fichiers)"
echo ""
echo "  ⏳ Démarrage... (le modèle Solon sera téléchargé si absent)"
echo ""

$PYTHON "$INGEST"

echo ""
echo "✅ Réindexation terminée."
echo "   Étape suivante : ./model/scripts/test_retrieval.sh"
