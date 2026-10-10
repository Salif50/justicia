#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
#  Déploie (ou met à jour) le backend JusticIA sur le VPS — une seule commande,
#  lancée depuis le Mac, à la racine du projet :
#
#    ./deploy/deploy.sh root@IP_DU_VPS             première installation et mises à jour
#    ./deploy/deploy.sh root@IP_DU_VPS --admin     + créer un compte administrateur
#    ./deploy/deploy.sh root@IP_DU_VPS --setup     + relancer la préparation du serveur
#
#  Enchaîne tout, sans rien à faire sur le serveur :
#    1. clé SSH (le mot de passe root n'est demandé qu'une fois)
#    2. préparation du VPS (Docker, pare-feu, swap, fail2ban, SSH par clé…)
#    3. envoi du code backend, de deploy/ et du moteur IA (index compris)
#    4. deploy/.env de production (secrets générés sur le serveur)
#    5. construction + démarrage (API, PostgreSQL, HTTPS Caddy)
#    6. sauvegarde quotidienne programmée (3 h)
#    7. attente de https://API_DOMAIN/health
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-justiciaapi.mosagix.com}"
FRONTEND_URL="${FRONTEND_URL:-https://justicia.mosagix.com}"
APP_DIR="/opt/justicia"

TARGET=""; WANT_ADMIN=0; FORCE_SETUP=0
for arg in "$@"; do
  case "$arg" in
    --admin) WANT_ADMIN=1 ;;
    --setup) FORCE_SETUP=1 ;;
    -*)      echo "Option inconnue : $arg"; exit 1 ;;
    *)       TARGET="$arg" ;;
  esac
done
if [ -z "$TARGET" ]; then
  sed -n '3,9p' "$0" | sed 's/^#//'
  exit 1
fi
case "$TARGET" in *@*) ;; *) TARGET="root@$TARGET" ;; esac
[ "${TARGET%%@*}" = "root" ] || { echo "✗ Utilisez root@IP (les étapes système demandent root)."; exit 1; }
HOST="${TARGET#*@}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ConnectTimeout=15)

step() { printf "\n\033[1;33m[%s] %s\033[0m\n" "$1" "$2"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m⚠️  %s\033[0m\n" "$1"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n" "$1"; exit 1; }
R()    { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }
resolve() { python3 -c "import socket,sys; print(socket.gethostbyname(sys.argv[1]))" "$1" 2>/dev/null || true; }

# ── 0. Vérifications locales ────────────────────────────────────────────────
step 0 "Vérifications"
command -v rsync >/dev/null || die "rsync introuvable sur ce Mac."
[ -f "$ROOT/model/04_pipeline/rag.py" ] && [ -d "$ROOT/model/03_vectorstore" ] \
  || die "Moteur IA incomplet : model/03_vectorstore est nécessaire (réindexer avec model/scripts/ingest.sh)."
ok "moteur IA présent ($(du -sh "$ROOT/model/03_vectorstore" | cut -f1) d'index)"

SERVER_IP="$(resolve "$HOST")"
DNS_IP="$(resolve "$API_DOMAIN")"
if [ -z "$DNS_IP" ]; then
  warn "$API_DOMAIN ne résout pas encore (DNS). HTTPS s'activera tout seul une fois le DNS propagé."
elif [ "$DNS_IP" != "$SERVER_IP" ]; then
  warn "$API_DOMAIN pointe vers $DNS_IP, pas vers ce VPS ($SERVER_IP) : corrigez l'enregistrement A (docs/DOMAINE_ET_DEPLOIEMENT.md)."
else
  ok "DNS : $API_DOMAIN → $SERVER_IP"
fi

# ── 1. Accès SSH par clé ────────────────────────────────────────────────────
step 1 "Accès SSH"
if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$TARGET" true 2>/dev/null; then
  KEY="$HOME/.ssh/id_ed25519"
  [ -f "$KEY.pub" ] || ssh-keygen -t ed25519 -N "" -C "justicia-$(whoami)" -f "$KEY" >/dev/null
  echo "  Installation de votre clé SSH sur le VPS : saisissez le mot de passe root (une seule fois)."
  ssh-copy-id -i "$KEY.pub" "${SSH_OPTS[@]}" "$TARGET" >/dev/null
  ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$TARGET" true 2>/dev/null || die "La connexion par clé ne fonctionne pas."
fi
ok "connexion par clé : $TARGET"

# Clé OpenAI demandée maintenant, pour que la suite tourne sans intervention
OPENAI_KEY=""
if ! R test -f "$APP_DIR/deploy/.env"; then
  LOCAL_KEY="$(grep -hE '^OPENAI_API_KEY=.+' "$ROOT/backend/.env" "$ROOT/deploy/.env" 2>/dev/null | head -1 | cut -d= -f2- || true)"
  if [ -n "$LOCAL_KEY" ]; then
    read -r -p "  Utiliser la clé OpenAI de votre configuration locale (…${LOCAL_KEY: -4}) ? [O/n] " r
    case "${r:-o}" in [nN]*) ;; *) OPENAI_KEY="$LOCAL_KEY" ;; esac
  fi
  if [ -z "$OPENAI_KEY" ]; then
    read -r -s -p "  Clé OpenAI de production (sk-…, rien ne s'affiche) : " OPENAI_KEY; echo
  fi
fi

# ── 2. Préparation du serveur ───────────────────────────────────────────────
step 2 "Préparation du serveur"
if [ "$FORCE_SETUP" = 1 ] || ! R test -f /etc/justicia-setup-done; then
  R "HARDEN_SSH=1 bash -s" < "$ROOT/deploy/setup-vps.sh"
else
  ok "déjà préparé (--setup pour relancer)"
fi

# ── 3. Envoi du code et du moteur IA ────────────────────────────────────────
step 3 "Envoi du code"
R "mkdir -p $APP_DIR/backend $APP_DIR/deploy $APP_DIR/model"
SYNC=(rsync -az --delete -e "ssh ${SSH_OPTS[*]}" --exclude '__pycache__/' --exclude '.DS_Store' --exclude '*.pyc')
# Les fichiers exclus ne sont jamais supprimés côté serveur (.env, backups, uploads…)
"${SYNC[@]}" --exclude 'env/' --exclude 'venv/' --exclude 'uploads/' --exclude 'tests/' --exclude '.env' --exclude '.env.local' \
  "$ROOT/backend/" "$TARGET:$APP_DIR/backend/"
ok "backend/"
"${SYNC[@]}" --exclude '.env' --exclude 'backups/' \
  "$ROOT/deploy/" "$TARGET:$APP_DIR/deploy/"
ok "deploy/"
"${SYNC[@]}" --exclude 'corpus/pdfs/' --exclude '.env' \
  "$ROOT/model/" "$TARGET:$APP_DIR/model/"
ok "model/ (index compris)"
R "chown -R deploy:deploy $APP_DIR && chmod +x $APP_DIR/deploy/*.sh"

# ── 4. Configuration de production ──────────────────────────────────────────
step 4 "Configuration (.env)"
if [ -n "$OPENAI_KEY" ] || ! R test -f "$APP_DIR/deploy/.env"; then
  printf '%s\n' "$OPENAI_KEY" | R "cd $APP_DIR/deploy && API_DOMAIN='$API_DOMAIN' FRONTEND_URL='$FRONTEND_URL' ./init-env.sh && chown deploy:deploy .env"
else
  ok "deploy/.env existant conservé (secrets inchangés)"
fi

# ── 5. Construction et démarrage ────────────────────────────────────────────
step 5 "Construction et démarrage (première fois : 5 à 10 min)"
R "cd $APP_DIR/deploy && ./up.sh" | sed 's/^/  /'
R "docker image prune -f >/dev/null 2>&1 || true"

# ── 6. Sauvegarde quotidienne ───────────────────────────────────────────────
step 6 "Sauvegardes"
R "mkdir -p $APP_DIR/deploy/backups && chown deploy:deploy $APP_DIR/deploy/backups && \
   printf '%s\n' 'SHELL=/bin/bash' 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' \
   '0 3 * * * root $APP_DIR/deploy/backup.sh >> $APP_DIR/deploy/backups/backup.log 2>&1' > /etc/cron.d/justicia-backup && \
   chmod 644 /etc/cron.d/justicia-backup"
ok "tous les jours à 3 h → $APP_DIR/deploy/backups (14 jours)"

# ── 7. Vérification ─────────────────────────────────────────────────────────
step 7 "Vérification"
printf "  Attente de l'API (chargement des modèles, ~2 à 5 min la première fois)"
LOCAL_OK=0
for _ in $(seq 1 90); do
  HEALTH="$(R "curl -fsS http://127.0.0.1:8000/health" 2>/dev/null || true)"
  if echo "$HEALTH" | grep -q '"loaded":true'; then LOCAL_OK=1; break; fi
  printf "."; sleep 10
done
echo ""
[ "$LOCAL_OK" = 1 ] && ok "API démarrée, modèles chargés" \
  || warn "API pas encore prête. Logs : ssh $TARGET 'cd $APP_DIR/deploy && docker compose logs --tail 80 api'"

if curl -fsS --max-time 15 "https://$API_DOMAIN/health" >/dev/null 2>&1; then
  ok "HTTPS opérationnel : https://$API_DOMAIN/health"
else
  warn "https://$API_DOMAIN pas encore joignable (DNS en cours de propagation ou certificat en cours)."
  warn "Caddy réessaie tout seul. Vérifier : curl https://$API_DOMAIN/health"
fi

if [ "$WANT_ADMIN" = 1 ]; then
  step + "Compte administrateur"
  ssh -t "${SSH_OPTS[@]}" "$TARGET" "cd $APP_DIR/deploy && docker compose exec api python create_superuser.py"
fi

cat <<EOF

══════════════════════════════════════════════════════════════════
  JusticIA backend déployé
  API      https://$API_DOMAIN
  Front    $FRONTEND_URL  (Vercel : API_URL=https://$API_DOMAIN)
  Mettre à jour : relancer ./deploy/deploy.sh $TARGET
  Logs     : ssh $TARGET 'cd $APP_DIR/deploy && docker compose logs -f api'
══════════════════════════════════════════════════════════════════
EOF
