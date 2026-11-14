#!/usr/bin/env bash
# Update Klyve on the EC2 server to the latest code on GitHub:
#   ssh -i klyve-key.pem ubuntu@<ip> "bash ~/klyve/deploy/ec2/update.sh"
# Database migrations only ADD changes (they never wipe data). PM2 waits up to
# 30 s for an email that's being sent before restarting, so nothing is sent twice.
set -euo pipefail
cd "$HOME/klyve"

echo "== Pull =="
git pull --ff-only
git log --oneline -1

echo "== Packages =="
npm ci --no-audit --no-fund

echo "== Database migrations =="
npx prisma migrate deploy

echo "== Build =="
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "== Restart =="
pm2 reload deploy/ec2/ecosystem.config.cjs --update-env
pm2 save
sleep 5
curl -fsS http://127.0.0.1:3000/api/health && echo
echo "UPDATE DONE"
