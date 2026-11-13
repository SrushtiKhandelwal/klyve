# Deploying Klyve

This guide puts Klyve on the internet on **one Linux server** with Docker:

```
 people ──HTTPS──▶ Caddy (certificates) ──▶ Klyve app (website + sending worker) ──▶ Postgres
```

Everything runs from `docker-compose.prod.yml`. You need about an hour the first time.

> Nothing in this guide has been run against a real server yet. Everything was built and
> tested locally, but the first real deploy should be done slowly, step by step.

---

## 0. What you need first

| Thing | Why | Notes |
|---|---|---|
| Your **AWS account** | Runs the server (Lightsail) and sends Klyve's own emails (SES) | Turn on a **billing alert** first (step 0.1) so nothing surprises you. |
| Your **domain** `klyveapp.tech` | The address people open | The app will live at `app.klyveapp.tech`. DNS is managed where you registered it (get.tech). |
| **SSH** | To run commands on the server | Lightsail has a "Connect using SSH" button in the browser — no setup needed. |

### 0.1 Billing alert (2 minutes, do this first)
AWS console → **Billing and Cost Management → Budgets → Create budget → "Monthly cost budget"** → amount e.g. 15 USD → your email. AWS emails you if spending goes over.

---

## 1. Create the server (AWS Lightsail)

Lightsail is AWS's simple "one server, fixed monthly price" product — much easier than EC2 for a first deploy.

1. AWS console → search **Lightsail** → **Create instance**.
2. Region: one close to your users (e.g. **Mumbai, ap-south-1**).
3. Platform **Linux/Unix**, blueprint **OS Only → Ubuntu 24.04 LTS**.
4. Plan: at least **2 GB RAM** (building the app needs it). Check the price shown before creating.
5. Name it `klyve` → **Create instance**.
6. **Networking** tab of the instance:
   - **Create static IP** and attach it (so the address never changes).
   - Under **IPv4 Firewall**, make sure **SSH (22)**, **HTTP (80)** and **HTTPS (443)** are allowed. Nothing else.

---

## 2. Point the domain at the server

At get.tech (where you manage `klyveapp.tech`) → DNS settings → add an **A record**:

| Type | Host / Name | Value |
|---|---|---|
| A | `app` | the Lightsail **static IP** |

Wait until `ping app.klyveapp.tech` shows that IP (minutes to an hour).

---

## 3. Prepare the server (once)

Click **Connect using SSH** on the instance. Run these one at a time:

```bash
sudo apt update && sudo apt upgrade -y
```

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo usermod -aG docker ubuntu
```

Add 2 GB of swap (extra memory on disk) so the build never runs out of memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Close the SSH window and open it again (so the `docker` group applies). Check:

```bash
docker run --rm hello-world
```

(Lightsail's firewall from step 1 only lets in SSH and web traffic. The database is never exposed.)

---

## 4. Klyve's own emails with Amazon SES

Klyve sends a few emails itself (verify email, password reset, double opt-in). Amazon SES is perfect for this, and the same SES account can be a sending provider inside Klyve.

1. AWS console → **Amazon SES** (same region as above) → **Identities → Create identity → Domain** → `klyveapp.tech`, keep **Easy DKIM** on.
2. SES shows **3 CNAME records**. Add them at get.tech DNS. After a while SES shows the domain as **Verified**.
3. Also add these DNS records at get.tech (they help emails land in the inbox):

   | Type | Host | Value |
   |---|---|---|
   | TXT | `@` | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:YOUR_EMAIL` |

4. **SMTP settings → Create SMTP credentials.** Save the SMTP username and password (shown once).
5. New SES accounts are in the **sandbox** (can only send to addresses you verified). Request **production access** under **Account dashboard → Request production access**: say it's for account emails (verification, password reset) of your app. Approval usually takes about a day.

Your `SYSTEM_SMTP_URL` (step 6) will be:

```
smtps://SMTP_USERNAME:SMTP_PASSWORD@email-smtp.ap-south-1.amazonaws.com:465
```

If the password contains `/`, `+` or `=`, replace them with `%2F`, `%2B` and `%3D` (URL-encoding), or the URL breaks.

---

## 5. Get the code

```bash
git clone https://github.com/SrushtiKhandelwal/klyve.git ~/klyve
```

```bash
cd ~/klyve
```

---

## 6. Fill in the settings

```bash
cp .env.production.example .env.production
```

```bash
nano .env.production
```

Fill in every empty value. For each secret, generate a fresh random value. This command prints one; run it again for the next secret:

```bash
docker run --rm node:22-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

- `BETTER_AUTH_SECRET`: one random value.
- `ENCRYPTION_KEY`: another random value. **Save a copy in your password manager.** It encrypts your users' provider passwords and API keys. If you lose it, every user has to reconnect their provider.
- `POSTGRES_PASSWORD`: another random value.
- `KLYVE_DOMAIN`, `APP_URL`, `BETTER_AUTH_URL`: your app address.
- `SYSTEM_SMTP_URL`: the SES SMTP URL from step 4. `SYSTEM_EMAIL_FROM`: e.g. `Klyve <no-reply@klyveapp.tech>`.

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

---

## 7. Start it

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

The first build takes 5–10 minutes. Then check:

```bash
docker compose -f docker-compose.prod.yml ps
```

All three services should be `running` (the app becomes `healthy` after about a minute). Open `https://app.klyveapp.tech`. Caddy fetches the HTTPS certificate on the first visit.

If something is wrong, read the logs:

```bash
docker compose -f docker-compose.prod.yml logs app --tail 100
```

---

## 8. First steps in the live app

1. Sign up with your own email and verify it. This checks that the system SMTP works.
2. Add your sending provider, sender and domain (SPF/DKIM/DMARC) exactly as you did locally.
3. Send a test campaign to yourself. Check that the unsubscribe link and the "view in browser" link open your real domain.
4. Point your provider's **webhooks** (bounces and complaints) at the URL shown on each provider's page in Settings → Providers. Locally these were only tested with sample payloads, so send a test bounce if the provider offers one.

---

## 9. Updating to a new version

```bash
cd ~/klyve && git pull
```

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Database migrations run automatically when the app starts (`prisma migrate deploy` only adds changes; it never wipes data). The worker finishes in-flight emails safely: an email interrupted mid-send is marked as "unknown" and is **never sent twice**.

---

## 10. Backups

`scripts/backup.sh` saves a compressed copy of the database to `backups/` and keeps the last 14 days.

Run it once by hand to check it works:

```bash
sh scripts/backup.sh
```

Then run it every night at 03:00:

```bash
crontab -e
```

Add this line:

```
0 3 * * * cd /home/ubuntu/klyve && sh scripts/backup.sh >> backups/backup.log 2>&1
```

**Copy backups off the server** too, e.g. with your VPS provider's snapshot feature, or `rclone` to cloud storage. A backup on the same disk doesn't survive the disk dying.

Uploaded images live in the Docker volume `uploads`. Your provider's server snapshots cover it.

### Restoring a backup

This replaces the current data, so be sure first:

```bash
gunzip -c backups/klyve-2026-01-01-0300.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U klyve -d klyve
```

(Restore into an empty database: stop the app, drop and recreate the database, restore, start the app.)

---

## 11. Monitoring

- **Uptime:** point a free uptime monitor (UptimeRobot, Better Stack…) at `https://app.klyveapp.tech/api/health`. It returns `{"status":"ok"}` when the app and database work, and HTTP 503 otherwise.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f app`. The worker logs every problem with a `[campaign worker]` prefix.
- **Disk:** `df -h` now and then. Logs and backups grow.

---

## 12. Things to know about this setup

- **One app server.** Some protections keep their counters in memory: login, sign-up and form spam limits, the API rate limit, and the sending speed limiter. They are correct for one server. If you ever run several app servers, those must move to a shared store (Redis). Also run the sending worker on exactly one of them (`RUN_CAMPAIGN_WORKER=false` on the others; see `src/instrumentation.ts`).
- **Images are stored on the server's disk** (the `uploads` volume). For a bigger service, move them to S3 or Cloudflare R2. `src/lib/media/storage.ts` was built so a new storage driver can be added without changing the rest of the app.
- **Public sign-ups:** anyone can create an account. Before inviting the public, read "Abuse prevention" in `docs/PRD.md` (Phase 10) and decide on limits for brand-new accounts.
- **Legal pages:** add your Terms of Service and Privacy Policy before opening sign-ups to everyone.
