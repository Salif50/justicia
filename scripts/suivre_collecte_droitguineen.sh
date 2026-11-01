#!/bin/zsh
# Suivi temps réel de la collecte Droitguinéen.
# Utilisation : ./scripts/suivre_collecte_droitguineen.sh

set -u
cd "$(dirname "$0")/.." || exit 1

trap 'printf "\nSuivi arrêté (la collecte continue).\n"; exit 0' INT TERM

while true; do
  clear
  date '+Dernière mise à jour : %Y-%m-%d %H:%M:%S'
  echo
  python3 scripts/show_droitguineen_progress.py
  echo
  echo "Actualisation automatique toutes les 5 secondes — Ctrl+C pour quitter le suivi."
  sleep 5
done
