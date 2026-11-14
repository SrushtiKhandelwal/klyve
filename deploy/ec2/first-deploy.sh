#!/usr/bin/env bash
# First deploy of Klyve on the server: code, database, settings, build, PM2.
# Secrets are generated here on the server and never printed.
set -euo pipefail
PUBLIC_URL="${PUBLIC_URL:?Set PUBLIC_URL, e.g. PUBLIC_URL=http://1.2.3.4}"
APP_DIR="$HOME/klyve"

echo "== 1. Code =="
if [ ! -d "$APP_DIR/.git" ]; then
  git clone https://github.com/SrushtiKhandelwal/klyve.git "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
git -C "$APP_DIR" log --oneline -1

echo "== 2. Database (user + database 'klyve', password generated) =="
if [ ! -f "$APP_DIR/.env" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='klyve') THEN CREATE ROLE klyve LOGIN PASSWORD '$DB_PASS'; ELSE ALTER ROLE klyve WITH PASSWORD '$DB_PASS'; END IF; END\$\$;"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='klyve'" | grep -q 1 || sudo -u postgres createdb -O klyve klyve

  echo "== 3. Settings (.env, secrets generated now) =="
  umask 077
  cat > "$APP_DIR/.env" <<EOF
# Klyve production settings. NEVER commit or share this file.
NODE_ENV="production"
DATABASE_URL="postgresql://klyve:${DB_PASS}@localhost:5432/klyve?schema=public"

# The public address. Change both to https://app.klyveapp.tech when the domain is connected.
APP_URL="${PUBLIC_URL}"
BETTER_AUTH_URL="${PUBLIC_URL}"

BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
# Encrypts users' provider passwords/API keys. KEEP A SAFE COPY (password manager).
ENCRYPTION_KEY="$(openssl rand -base64 32)"

# Klyve's own emails (verification, password reset, invites). Set when Amazon SES is ready.
SYSTEM_SMTP_URL=""
SYSTEM_EMAIL_FROM="Klyve <no-reply@klyveapp.tech>"

CONTACT_EMAIL="hello@klyveapp.tech"

# AI writing help: paste your Groq key between the quotes.
GROQ_API_KEY=""
EOF
  chmod 600 "$APP_DIR/.env"
  echo ".env written (secrets hidden)"
else
  echo ".env already exists, kept as is"
fi
mkdir -p "$APP_DIR/storage/uploads" "$APP_DIR/backups"

echo "== 4. Install packages =="
cd "$APP_DIR"
npm ci --no-audit --no-fund

echo "== 5. Database tables (migrations) =="
npx prisma migrate deploy

echo "== 6. Build (a few minutes) =="
NEXT_TELEMETRY_DISABLED=1 npm run build

echo "DEPLOY-APP DONE"
