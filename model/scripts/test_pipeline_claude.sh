#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 3b — Test pipeline avec Claude (Anthropic)
#  Provider : claude-opus-4-8 (modèle Anthropic le plus puissant)
#  Prérequis : ingestion terminée (model/scripts/ingest.sh)
#  Coût : ~$0.05–0.20 par test complet (6 questions × tokens générés)
# ══════════════════════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # racine du projet

export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
PYTHON="$ROOT/backend/env/bin/python3"
TEST="$ROOT/model/test_pipeline.py"
ENV="$ROOT/model/.env"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  JusticIA — Test pipeline Claude         ║"
echo "║  Provider : anthropic (claude-opus-4-8)  ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Vérifier que la clé Anthropic est dans le .env
if ! grep -q "ANTHROPIC_API_KEY=sk-ant" "$ENV"; then
    echo "❌ ANTHROPIC_API_KEY manquante dans model/.env"
    exit 1
fi

echo "✅ Clé Anthropic détectée"
echo ""

cd "$ROOT/model"
$PYTHON "$TEST" --provider anthropic

echo ""
echo "✅ Test Claude terminé."
echo "   Pour utiliser Claude dans le backend, édite backend/.env :"
echo "   → RAG_LLM_PROVIDER=anthropic"
