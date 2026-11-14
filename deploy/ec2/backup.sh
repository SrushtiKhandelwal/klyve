#!/usr/bin/env bash
# Nightly database backup for the EC2 setup (PostgreSQL on the server, no Docker).
# Saves a compressed dump to ~/klyve/backups and keeps the last 14 days.
# Installed as a cron job: 0 3 * * *  (03:00 server time = UTC).
set -euo pipefail
cd "$HOME/klyve"
mkdir -p backups

# Read DATABASE_URL from .env without printing it.
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
# pg_dump doesn't understand Prisma's ?schema=public option.
DATABASE_URL="${DATABASE_URL%%\?*}"

FILE="backups/klyve-$(date -u +%Y-%m-%d-%H%M).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$FILE"
echo "$(date -u +%FT%TZ) saved $FILE ($(du -h "$FILE" | cut -f1))"

# Keep 14 days.
find backups -name 'klyve-*.sql.gz' -mtime +14 -delete
