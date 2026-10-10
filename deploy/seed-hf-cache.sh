#!/bin/sh
# Copie les modèles d'embedding déjà présents sur ce Mac dans le volume Docker,
# pour éviter ~2,5 Go de téléchargement au premier démarrage (utile en local).
#   ./deploy/seed-hf-cache.sh        (la stack doit être démarrée : ./up.sh)
set -e
cd "$(dirname "$0")"
SRC="${HF_HOME:-$HOME/.cache/huggingface}/hub"
MODELS="models--OrdalieTech--Solon-embeddings-large-0.1 models--cross-encoder--mmarco-mMiniLMv2-L12-H384-v1"
for m in $MODELS; do
  [ -d "$SRC/$m" ] || { echo "✗ $m absent de $SRC (il sera téléchargé au premier appel)"; exit 1; }
done
docker compose exec -T api mkdir -p /app/.cache/huggingface/hub
( cd "$SRC" && COPYFILE_DISABLE=1 tar --no-xattrs -cf - $MODELS 2>/dev/null || tar -cf - $MODELS ) \
  | docker compose exec -T api tar -C /app/.cache/huggingface/hub -xf - 2>/dev/null
docker compose restart api >/dev/null
echo "✓ Modèles copiés dans le volume hf_cache, API redémarrée."
