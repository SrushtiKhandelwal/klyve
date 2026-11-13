#!/bin/sh
# Daily database backup for a production server (see docs/DEPLOY.md → Backups).
#
#   sh scripts/backup.sh            # run once by hand
#   crontab -e  →  0 3 * * * cd /opt/klyve && sh scripts/backup.sh >> backups/backup.log 2>&1
#
# Writes backups/klyve-YYYY-MM-DD-HHMM.sql.gz and keeps the last 14 days.
# Copy the backups folder somewhere else too (another machine / cloud storage):
# a backup on the same disk doesn't survive the disk dying.
set -eu

cd "$(dirname "$0")/.."
# Read POSTGRES_USER / POSTGRES_DB from .env.production (defaults match the compose file).
if [ -f .env.production ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.production
  set +a
fi
USER_NAME="${POSTGRES_USER:-klyve}"
DB_NAME="${POSTGRES_DB:-klyve}"
STAMP="$(date -u +%Y-%m-%d-%H%M)"
FILE="backups/klyve-$STAMP.sql.gz"

mkdir -p backups
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$USER_NAME" -d "$DB_NAME" --no-owner --format=plain \
  | gzip > "$FILE"

# A tiny file means something went wrong; don't let it replace good backups.
SIZE=$(wc -c < "$FILE")
if [ "$SIZE" -lt 1000 ]; then
  echo "Backup looks empty ($SIZE bytes): $FILE" >&2
  exit 1
fi

find backups -name 'klyve-*.sql.gz' -mtime +14 -delete
echo "Backup OK: $FILE ($SIZE bytes)"
