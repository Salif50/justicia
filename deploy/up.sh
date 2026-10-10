#!/bin/sh
# Démarre (ou met à jour) le backend JusticIA. Même commande en local et sur le VPS.
#   ./up.sh            → construit l'image et lance db + api (+ HTTPS si API_DOMAIN est défini)
set -e
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
cd "$DEPLOY_DIR"

if [ ! -f .env ]; then
  echo "✗ deploy/.env introuvable."
  echo "    cd deploy && cp .env.example .env   # puis remplir les secrets"
  exit 1
fi

if [ ! -d "$ROOT/model/03_vectorstore" ] || [ ! -f "$ROOT/model/04_pipeline/rag.py" ]; then
  echo "✗ Moteur IA incomplet : il faut model/03_vectorstore et model/04_pipeline."
  echo "    Depuis votre Mac : ./deploy/sync-model.sh user@ip-du-vps:/chemin/JusticIA"
  exit 1
fi

PROFILE=""
if grep -Eq '^API_DOMAIN=.+' .env; then
  PROFILE="--profile https"
  echo "→ HTTPS activé pour $(grep -E '^API_DOMAIN=' .env | cut -d= -f2)"
fi

docker compose $PROFILE up -d --build

PORT="$(grep -E '^API_PORT=' .env | cut -d= -f2)"
echo ""
echo "✓ JusticIA démarre (premier lancement : ~2 min, téléchargement des modèles d'embedding)"
echo "  Santé : curl http://localhost:${PORT:-8000}/health"
echo "  Docs  : http://localhost:${PORT:-8000}/docs"
echo "  Logs  : docker compose logs -f api    (depuis deploy/)"
echo "  Arrêt : ./stop.sh   ·   Redémarrage : ./restart.sh"
