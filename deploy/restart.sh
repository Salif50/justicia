#!/bin/sh
# Redémarre le backend JusticIA sans reconstruire l'image.
#   ./restart.sh           → redémarre l'API (rapide : après une réindexation de model/)
#   ./restart.sh --all     → redémarre tous les services (API, base, HTTPS)
#   ./restart.sh --build   → reconstruit l'image puis redémarre (après une modif du code backend)
set -e
cd "$(dirname "$0")"

PROFILE=""
if [ -f .env ] && grep -Eq '^API_DOMAIN=.+' .env; then
  PROFILE="--profile https"
fi

case "$1" in
  --build) exec ./up.sh ;;
  --all)   docker compose $PROFILE restart ;;
  "")      docker compose restart api ;;
  *)       echo "Usage : $0 [--all | --build]"; exit 1 ;;
esac

PORT="$(grep -E '^API_PORT=' .env 2>/dev/null | cut -d= -f2)"
printf "→ Attente de l'API"
for i in $(seq 1 30); do
  if curl -fsS "http://localhost:${PORT:-8000}/health" >/dev/null 2>&1; then
    printf "\n✓ API prête : http://localhost:%s\n" "${PORT:-8000}"
    exit 0
  fi
  printf "."; sleep 2
done
printf "\n⚠️  L'API ne répond pas encore. Logs : docker compose logs -f api\n"
