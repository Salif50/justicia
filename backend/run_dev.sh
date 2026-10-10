#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  ÉTAPE 4 — Démarrer le serveur backend (FastAPI)
#  URL : http://localhost:8000
#  Docs API : http://localhost:8000/docs
#  Arrêter : Ctrl+C
# ══════════════════════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # racine du projet

export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
PYTHON="$ROOT/backend/env/bin/python3"
UVICORN="$ROOT/backend/env/bin/uvicorn"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  JusticIA — Backend FastAPI              ║"
echo "║  http://localhost:8000                   ║"
echo "║  http://localhost:8000/docs              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$ROOT/backend"
$UVICORN main:app --reload --host 0.0.0.0 --port 8000
