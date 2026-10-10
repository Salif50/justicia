#!/bin/sh
# Envoie le moteur IA (model/) vers le VPS, sans ce qui est inutile en production.
#   ./deploy/sync-model.sh user@ip-du-vps:/opt/JusticIA
# Exclus : PDF sources, secrets locaux, caches.
set -e
if [ -z "$1" ]; then
  echo "Usage : $0 user@hote:/chemin/vers/JusticIA"
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rsync -avz --delete --progress \
  --exclude 'corpus/pdfs/' \
  --exclude '.env' \
  --exclude '__pycache__/' \
  --exclude '.DS_Store' \
  "$ROOT/model/" "$1/model/"
echo "✓ model/ synchronisé. Sur le VPS : cd deploy && docker compose restart api"
