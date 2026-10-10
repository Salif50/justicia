#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 2 — Test du pipeline RAG
#  Durée : 2-5 min
#  Vérifie que la réindexation s'est bien passée et que le pipeline répond
# ══════════════════════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # racine du projet

export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
PYTHON="$ROOT/backend/env/bin/python3"
TEST="$ROOT/model/test_pipeline.py"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  JusticIA — Test pipeline RAG            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. État du vectorstore ────────────────────────────────────────────────────
echo "── État du vectorstore ──────────────────────────────────────────────────"
cd "$ROOT/model"
$PYTHON "$TEST" --status
echo ""

# ── 2. Test retriever seul (sans LLM) ─────────────────────────────────────────
echo "── Test retriever (BM25 + Solon + Cross-encoder) ────────────────────────"
$PYTHON "$TEST" --retriever-only
echo ""

echo "✅ Retriever OK."
echo "   Étape suivante : ./model/scripts/test_pipeline_ollama.sh"
