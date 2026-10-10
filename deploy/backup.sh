#!/bin/bash
# Sauvegarde la base PostgreSQL et les fichiers déposés par les utilisateurs.
#   ./backup.sh                 → deploy/backups/AAAA-MM-JJ_HHMM/
# Conserve les 14 dernières sauvegardes (KEEP=30 ./backup.sh pour changer).
# Tous les jours à 3 h (crontab -e) :
#   0 3 * * * /opt/justicia/deploy/backup.sh >> /opt/justicia/deploy/backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
KEEP="${KEEP:-14}"
DEST="backups/$(date +%Y-%m-%d_%H%M)"
mkdir -p "$DEST"

# Base : dump au format custom (compressé, restauration sélective possible)
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$DEST/db.dump"

# Fichiers déposés (volume uploads)
docker compose exec -T api tar -C /app/backend -czf - uploads > "$DEST/uploads.tar.gz"

echo "✓ $(date '+%F %T') sauvegarde $DEST ($(du -sh "$DEST" | cut -f1))"

# Rotation : on garde les $KEEP plus récentes
ls -1d backups/20*/ 2>/dev/null | sort | head -n -"$KEEP" | xargs -r rm -rf

# Restaurer (⚠️ remplace la base actuelle) :
#   docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < backups/<date>/db.dump
#   docker compose exec -T api tar -C /app/backend -xzf - < backups/<date>/uploads.tar.gz
