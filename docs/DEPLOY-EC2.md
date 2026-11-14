# Deploying Klyve on AWS EC2 (PM2 + Nginx, no Docker)

This is how Klyve actually runs in production (set up 2026-11-14). Live at **https://app.klyveapp.tech** (klyveapp.tech, www and the bare IP redirect there).

```
people ──HTTP(S)──▶ Nginx ──▶ PM2 (one Klyve process: website + sending worker) ──▶ PostgreSQL 17
```

Everything is installed directly on one Ubuntu server. No Docker.
(`docs/DEPLOY.md` describes an alternative Docker/Lightsail setup that is **not** used.)

| Thing | Value |
|---|---|
| Server | EC2 `klyve-server`, Mumbai (ap-south-1), t3.small (2 vCPU, 2 GB) + 2 GB swap, 30 GB disk, Ubuntu 24.04 |
| Address | Elastic IP **13.206.214.215**; DNS A records `app`, `@`, `www` at get.tech |
| HTTPS | Let's Encrypt via certbot (Nginx plugin), renews itself (certbot.timer) |
| Login | `ssh -i C:\Users\srush\.ssh\klyve-key.pem ubuntu@13.206.214.215` |
| App folder | `/home/ubuntu/klyve` (a clone of this repo) |
| Settings | `/home/ubuntu/klyve/.env` (only on the server, never in git) |
| Firewall (security group) | 22 (SSH), 80 (HTTP), 443 (HTTPS). Postgres listens on 127.0.0.1 only; the app on 127.0.0.1:3000 only. |
| Files in this repo | `deploy/ec2/` (setup, first deploy, update, backup, PM2 and Nginx config) |

## Update to the latest code

Push to GitHub first, then:

```bash
ssh -i C:\Users\srush\.ssh\klyve-key.pem ubuntu@<server IP> "bash ~/klyve/deploy/ec2/update.sh"
```

It pulls, installs packages, runs database migrations (they only add, never wipe), builds,
and restarts the one PM2 process. PM2 waits up to 30 s for an email that's being sent, so
nothing is sent twice.

## Everyday commands (on the server)

```bash
pm2 ls                      # is it running?
pm2 logs klyve --lines 100  # recent logs ([campaign worker] lines are the sender)
pm2 restart klyve           # restart after editing .env
curl -s localhost:3000/api/health   # {"status":"ok"} = app + database fine
sudo nginx -t && sudo systemctl reload nginx   # after editing the Nginx config
```

## Settings in `.env`

| Key | Notes |
|---|---|
| `DATABASE_URL` | Generated on first deploy (user `klyve`, random password). |
| `APP_URL`, `BETTER_AUTH_URL` | The public address. `http://<IP>` until the domain is connected, then `https://app.klyveapp.tech`. Rebuild + restart after changing (`update.sh`). |
| `BETTER_AUTH_SECRET` | Random, generated on the server. |
| `ENCRYPTION_KEY` | Random, generated on the server. **Keep a copy in a password manager**: it encrypts users' provider passwords/API keys; if it's lost they all have to reconnect. |
| `SYSTEM_SMTP_HOST`, `_PORT`, `_USER`, `_PASS` | Klyve's own emails (verify, reset, invites) through Amazon SES (`email-smtp.ap-south-1.amazonaws.com`, 465, IAM user `klyve-ses-smtp`). `SYSTEM_SMTP_URL` stays empty. SES production access requested 2026-11-14; until AWS approves it, SES only delivers to verified addresses (e.g. @klyveapp.tech). |
| `GROQ_API_KEY` | AI writing help. Paste your key; then `pm2 restart klyve`. |
| `CONTACT_EMAIL` | `hello@klyveapp.tech` (forwarded to Gmail by ImprovMX). |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | "Continue with Google". Google Cloud project **Klyve** (`klyve-514718`, owned by the main Gmail) → Google Auth Platform → Clients → "Klyve web". Redirect URIs: `https://app.klyveapp.tech/api/auth/callback/google` and `http://localhost:3000/api/auth/callback/google`. The secret is shown only once at creation; if it's lost, add a new secret there. Run `update.sh` after changing (the button is built into the page). |

## Backups

`deploy/ec2/backup.sh` runs every night at 03:00 UTC (cron) and keeps 14 days of compressed
database dumps in `~/klyve/backups`. Uploaded images are in `~/klyve/storage/uploads`.
Both are on the server's disk only: also take an **EBS snapshot** of the server now and then
(EC2 → Volumes → Create snapshot), so a dead disk doesn't take the backups with it.

Restore (replaces current data; stop the app first: `pm2 stop klyve`):

```bash
gunzip -c ~/klyve/backups/klyve-YYYY-MM-DD-HHMM.sql.gz | psql "postgresql://klyve:<password>@localhost:5432/klyve"
```

## Connecting the domain (DONE 2026-11-14; kept for reference)

1. EC2 → **Elastic IPs** → allocate one and associate it with `klyve-server` (the plain public
   IP changes whenever the server is stopped and started).
2. get.tech DNS → **A record** `app` → the Elastic IP.
3. In `deploy/ec2/nginx-klyve.conf` set `server_name app.klyveapp.tech;`, copy it to
   `/etc/nginx/sites-available/klyve`, reload Nginx.
4. HTTPS: `sudo apt install -y certbot python3-certbot-nginx` then
   `sudo certbot --nginx -d app.klyveapp.tech` (free Let's Encrypt certificate, renews itself).
5. In `.env` set `APP_URL` and `BETTER_AUTH_URL` to `https://app.klyveapp.tech`, then run `update.sh`.
6. Amazon SES for `SYSTEM_SMTP_URL` (see `docs/DEPLOY.md` step 4 for the DNS records; the SPF
   record already exists).

## First-time setup (already done; for a new server)

```bash
bash deploy/ec2/setup-server.sh        # swap, updates, Node 22, PostgreSQL 17, Nginx, PM2
PUBLIC_URL=http://<IP> bash deploy/ec2/first-deploy.sh   # clone, database, .env, build
pm2 start deploy/ec2/ecosystem.config.cjs && pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
# Nginx: copy deploy/ec2/nginx-klyve.conf to /etc/nginx/sites-available/klyve, link it in
# sites-enabled, remove the default site, nginx -t, reload.
# Backups: (crontab -l; echo "0 3 * * * bash /home/ubuntu/klyve/deploy/ec2/backup.sh >> /home/ubuntu/klyve/backups/backup.log 2>&1") | crontab -
```
