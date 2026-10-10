#!/bin/bash
# Crée deploy/.env de PRODUCTION : secrets générés, domaines JusticIA préremplis.
#   ./init-env.sh                     → interactif (Entrée = valeur proposée)
#   echo "sk-…" | ./init-env.sh       → non interactif (utilisé par deploy.sh)
# Variables facultatives : API_DOMAIN, FRONTEND_URL, GOOGLE_CLIENT_ID.
# Refuse d'écraser un .env existant.
set -euo pipefail
cd "$(dirname "$0")"

DEFAULT_API_DOMAIN="justiciaapi.mosagix.com"
DEFAULT_FRONTEND_URL="https://justicia.mosagix.com"
# Identifiant OAuth public du frontend (pas un secret) : sert à vérifier les jetons Google
DEFAULT_GOOGLE_CLIENT_ID="187543661599-uddpi23b7mles0pbjo6fbtt9thgoqcrn.apps.googleusercontent.com"

if [ -f .env ]; then
  echo "✗ deploy/.env existe déjà. Modifiez-le (nano .env) ou supprimez-le pour recommencer."
  exit 1
fi

API_DOMAIN="${API_DOMAIN:-$DEFAULT_API_DOMAIN}"
FRONT="${FRONTEND_URL:-$DEFAULT_FRONTEND_URL}"
GOOGLE_ID="${GOOGLE_CLIENT_ID:-$DEFAULT_GOOGLE_CLIENT_ID}"

if [ -t 0 ]; then
  read -r -p "Domaine de l'API [$API_DOMAIN] : " r; API_DOMAIN="${r:-$API_DOMAIN}"
  read -r -p "URL du frontend [$FRONT] : " r;     FRONT="${r:-$FRONT}"
  read -r -s -p "Clé OpenAI (sk-…, rien ne s'affiche) : " OPENAI_KEY; echo
else
  read -r OPENAI_KEY || true   # clé transmise sur l'entrée standard (jamais en argument)
fi
FRONT="${FRONT%/}"
[ -n "${OPENAI_KEY:-}" ] || echo "⚠️  Clé OpenAI vide : les questions échoueront tant que OPENAI_API_KEY n'est pas renseignée."

DB_PASS="$(openssl rand -hex 24)"    # hex : aucun caractère à échapper dans l'URL
SECRET="$(openssl rand -hex 32)"
BACKEND="https://$API_DOMAIN"

umask 077
cp .env.example .env
chmod 600 .env
set_var() {  # set_var CLE valeur — remplace la ligne CLE=…
  local v="${2//\\/\\\\}"; v="${v//&/\\&}"; v="${v//|/\\|}"
  sed -i.bak "s|^$1=.*|$1=$v|" .env
}
set_var APP_ENV production
set_var POSTGRES_PASSWORD "$DB_PASS"
set_var DATABASE_URL "postgresql+asyncpg://justicia:$DB_PASS@db:5432/db_justicia"
set_var DATABASE_URL_SYNC "postgresql://justicia:$DB_PASS@db:5432/db_justicia"
set_var SECRET_KEY "$SECRET"
set_var API_DOMAIN "$API_DOMAIN"
set_var OPENAI_API_KEY "${OPENAI_KEY:-}"
set_var FRONTEND_URL "$FRONT"
set_var APP_PUBLIC_FRONTEND_URL "$FRONT"
set_var CORS_ORIGINS "$FRONT"
set_var BACKEND_URL "$BACKEND"
set_var APP_PUBLIC_BACKEND_URL "$BACKEND"
set_var GOOGLE_CLIENT_ID "$GOOGLE_ID"
rm -f .env.bak

echo "✓ deploy/.env créé (droits 600) — API https://$API_DOMAIN · front $FRONT"
echo "  Secrets générés : mot de passe PostgreSQL, SECRET_KEY."
