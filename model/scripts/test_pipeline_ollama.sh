#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  Test du pipeline complet (recherche + LLM local Qwen via Ollama)
#  Durée : plusieurs minutes (questions juridiques, ~1-2 min par réponse sur Mac)
#  Prérequis : Ollama lancé, modèle installé (ollama pull qwen2.5:14b)
#  Modèle : OLLAMA_MODEL (défaut qwen2.5:14b)
# ══════════════════════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # racine du projet
MODEL="${OLLAMA_MODEL:-qwen2.5:14b}"

export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
export OLLAMA_MODEL="$MODEL"
PYTHON="$ROOT/backend/env/bin/python3"
TEST="$ROOT/model/test_pipeline.py"

echo ""
echo "JusticIA — test du pipeline complet · LLM local : $MODEL (Ollama)"
echo ""

if ! ollama list 2>/dev/null | grep -q "^${MODEL}"; then
    echo "✗ Modèle $MODEL introuvable dans Ollama."
    echo "  Installer : ollama pull $MODEL"
    exit 1
fi
echo "✓ Ollama : $MODEL disponible"
echo ""

cd "$ROOT/model"
$PYTHON "$TEST" --provider ollama

echo ""
echo "✓ Pipeline complet OK. Lancer le backend : ./backend/run_dev.sh"
