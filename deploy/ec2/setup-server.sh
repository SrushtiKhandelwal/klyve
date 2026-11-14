#!/usr/bin/env bash
# One-time server setup for Klyve (Ubuntu 24.04): swap, updates, Node 22,
# PostgreSQL 17, Nginx, git, PM2. Safe to run twice.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

echo "== 1. Swap (2 GB) =="
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -h | head -3

echo "== 2. System updates =="
sudo apt-get update -y
sudo apt-get -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade -y

echo "== 3. Basic tools =="
sudo apt-get install -y curl ca-certificates gnupg git nginx

echo "== 4. Node.js 22 (NodeSource) =="
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "== 5. PostgreSQL 17 (official PostgreSQL apt repo) =="
if ! command -v psql >/dev/null || ! psql --version | grep -q ' 17'; then
  sudo apt-get install -y postgresql-common
  sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  sudo apt-get install -y postgresql-17
fi
psql --version
sudo systemctl enable --now postgresql

echo "== 6. PM2 =="
if ! command -v pm2 >/dev/null; then
  sudo npm install -g pm2
fi
pm2 -v

echo "== 7. Firewall check: Postgres only on localhost =="
sudo ss -ltnp | grep -E ':5432|:80 ' || true

echo "SETUP DONE"
