#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════
#  Préparation d'un VPS Ubuntu 24.04 neuf pour JusticIA (à lancer UNE fois, en root)
#
#    ./deploy/deploy.sh root@IP_DU_VPS      <- s'en charge (recommandé)
#    ou à la main : ssh root@IP_DU_VPS 'bash -s' < deploy/setup-vps.sh
#
#  Normalement lancé AUTOMATIQUEMENT par deploy.sh (depuis le Mac).
#  Fait : mises à jour + mises à jour de sécurité automatiques, Docker officiel,
#  rotation des logs Docker, swap 4 Go, pare-feu (22/80/443), fail2ban,
#  utilisateur « deploy » (sudo + docker), dossier /opt/justicia,
#  SSH par clé uniquement (HARDEN_SSH=1). Relançable sans risque (idempotent).
# ══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
APP_DIR="${APP_DIR:-/opt/justicia}"
SWAP_SIZE="${SWAP_SIZE:-4G}"

[ "$(id -u)" -eq 0 ] || { echo "✗ À lancer en root : sudo bash $0"; exit 1; }
. /etc/os-release
[ "$ID" = "ubuntu" ] || echo "⚠️  Testé pour Ubuntu 24.04 (détecté : $PRETTY_NAME)"

step() { printf "\n\033[1;33m→ %s\033[0m\n" "$1"; }
export DEBIAN_FRONTEND=noninteractive

step "Mises à jour du système"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg git rsync ufw fail2ban unattended-upgrades htop
dpkg-reconfigure -f noninteractive unattended-upgrades

step "Docker (dépôt officiel)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "  déjà installé : $(docker --version)"
fi

# Sans limite, les logs des conteneurs finissent par remplir le disque
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
JSON
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null

step "Swap ${SWAP_SIZE} (sécurité en cas de pic mémoire)"
if ! swapon --show | grep -q .; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-justicia-swap.conf
  sysctl -q -p /etc/sysctl.d/99-justicia-swap.conf
else
  echo "  swap déjà présent"
fi

step "Pare-feu : SSH, HTTP, HTTPS uniquement"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null   # HTTP/3 (Caddy)
ufw --force enable >/dev/null
ufw status | sed 's/^/  /'

step "fail2ban (bannit les tentatives SSH répétées)"
systemctl enable --now fail2ban >/dev/null

step "Utilisateur « ${DEPLOY_USER} »"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER" >/dev/null
fi
usermod -aG sudo,docker "$DEPLOY_USER"
# Même accès SSH que root (vos clés), sans mot de passe à saisir pour sudo
if [ -f /root/.ssh/authorized_keys ]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"

step "Dossier de l'application : ${APP_DIR}"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

# Connexion SSH par clé uniquement — seulement si une clé est déjà installée
# (deploy.sh vérifie qu'elle fonctionne avant de demander ce durcissement).
if [ "${HARDEN_SSH:-0}" = "1" ] && [ -s /root/.ssh/authorized_keys ]; then
  step "SSH : clé obligatoire, mots de passe désactivés"
  # 00- : lu avant 50-cloud-init.conf (la première valeur lue l'emporte)
  cat > /etc/ssh/sshd_config.d/00-justicia.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 4
X11Forwarding no
SSHD
  # Ubuntu 24.04 : SSH est activé à la demande, /run/sshd peut ne pas exister encore
  mkdir -p /run/sshd && chmod 755 /run/sshd
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl restart ssh
  else
    echo "✗ Configuration SSH invalide : durcissement annulé"
    rm -f /etc/ssh/sshd_config.d/00-justicia.conf
  fi
fi

touch /etc/justicia-setup-done
echo ""
echo "✓ VPS prêt.  RAM : $(free -h | awk '/Mem:/{print $2}') · Swap : $(free -h | awk '/Swap:/{print $2}') · Disque libre : $(df -h / | awk 'NR==2{print $4}')"
