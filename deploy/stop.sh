#!/bin/sh
# Arrête le backend JusticIA (API, base, HTTPS). Les données sont conservées.
#   ./stop.sh
set -e
cd "$(dirname "$0")"
# --profile https : arrête aussi Caddy s'il tourne (sans effet sinon)
docker compose --profile https down
echo "✓ JusticIA arrêté (base de données et modèles conservés)."
echo "  Relancer : ./up.sh"
