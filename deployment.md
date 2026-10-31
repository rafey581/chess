# Deployment Guide — AWS EC2 + Vercel

## Architecture

| Component | Host | Why |
|---|---|---|
| `@snooker/client` (Vite SPA) | Vercel (static) | Cheap, CDN, instant deploys |
| `@snooker/server` (Fastify + Socket.IO) | AWS EC2 | Long-running process + WebSockets (not serverless-compatible) |
| PostgreSQL 16 | Docker on the same EC2 instance | Fits free tier; simplest topology |

The client hardcodes same-origin `API_BASE = '/api'` and `io('/')`, so Vercel must
rewrite `/api/**` and `/socket.io/**` to the EC2 server.

---

## 1. AWS EC2 Setup (Free Tier)

### 1.1 Launch instance

- **AMI:** Ubuntu 24.04 LTS (or Amazon Linux 2023)
- **Instance type:** `t3.micro` (or `t2.micro`) — **1 vCPU, 1 GiB RAM, 750 hrs/month free for 12 months**
- **Region:** `us-east-1` (safest for free-tier eligibility)
- **Storage:** 20 GB gp3 (free tier covers 30 GB EBS)
- **Security Group:**
  - Port 22 — restrict to *your IP only*
  - Port 80, 443 — 0.0.0.0/0
  - Port 4000 — optional during testing, close after nginx is up

> **Note:** Free tier requires a valid payment card on the AWS account and lasts 12 months.

### 1.2 Install prerequisites

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs docker.io nginx certbot python3-certbot-nginx git
sudo systemctl enable --now docker
sudo npm install -g pnpm
sudo usermod -aG docker $USER && newgrp docker
```

### 1.3 Clone & build

```bash
git clone <your-repo-url> snooker && cd snooker
pnpm install          # workspace:* + Prisma postinstall need pnpm, not npm
pnpm build            # builds shared → server (prisma generate + tsc) → client
```

### 1.4 Configure the server

```bash
cp .env.example packages/server/.env
```

Edit `packages/server/.env`:

```dotenv
DATABASE_URL=postgresql://snooker:snooker@localhost:5432/snooker
JWT_SECRET=<openssl rand -hex 32>
COOKIE_SECRET=<openssl rand -hex 32>
PORT=4000
CLIENT_ORIGIN=https://<your-vercel-domain>.vercel.app
NODE_ENV=production
LOG_LEVEL=info
REAL_MONEY_ENABLED=false
```

> ⚠️ The env file **must** live at `packages/server/.env` (dotenv reads from cwd).
> `CLIENT_ORIGIN` must exactly match your frontend origin (comma-separated for multiple).

### 1.5 Database

```bash
pnpm db:up                                      # docker compose up -d postgres
pnpm db:deploy                                  # prisma migrate deploy (NEVER db:migrate in prod)
SEED_ADMIN_PASSWORD='<strong-password>' pnpm db:seed
pnpm db:status                                  # verify: up to date
```

### 1.6 Run as a service

Create `/etc/systemd/system/snooker.service`:

```ini
[Unit]
Description=Chess Game Server
After=network.target docker.service

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/snooker
ExecStart=/usr/bin/node packages/server/dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
EnvironmentFile=/home/ubuntu/snooker/packages/server/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now snooker
sudo systemctl status snooker
curl http://localhost:4000/api/health
```

### 1.7 nginx reverse proxy (required for WebSockets)

`/etc/nginx/sites-available/snooker`:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80;
    server_name <your-ec2-domain-or-ip>;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/snooker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <your-ec2-domain>     # HTTPS (needed for WSS + secure cookies)
```

> Use a real domain (Route 53 or any registrar) pointing to the EC2 Elastic IP —
> browsers block mixed content (HTTPS Vercel page → HTTP WS API).

### 1.8 Verify

```bash
curl https://<ec2-domain>/api/health    # ok
curl https://<ec2-domain>/api/ready     # 503 if DB is down (use for health checks)
```

---

## 2. Vercel Deployment

### 2.1 Import project

- **Framework preset:** Vite
- **Root Directory:** repo root (Settings → General)
- **Build Command:** `pnpm --filter @snooker/client build`
- **Output Directory:** `packages/client/dist`
- **Install Command:** `pnpm install` (Vercel detects `pnpm-workspace.yaml`)

### 2.2 Create `vercel.json` (repo root)

```json
{
  "rewrites": [
    { "source": "/api/(.*)",      "destination": "https://<ec2-domain>/api/$1" },
    { "source": "/socket.io/(.*)", "destination": "https://<ec2-domain>/socket.io/$1" }
  ],
  "headers": [
    {
      "source": "/socket.io/(.*)",
      "headers": [
        { "key": "Connection", "value": "upgrade" },
        { "key": "Upgrade", "value": "websocket" }
      ]
    }
  ]
}
```

No client env vars are needed — the client uses relative `/api` paths.

### 2.3 Final CORS step

Set on the EC2 `.env` and restart:

```dotenv
CLIENT_ORIGIN=https://<your-project>.vercel.app
```

---

## 3. WebSocket caveat (important)

Vercel's rewrite proxy does **not** reliably forward WebSocket upgrades in all
plans/regions. Test immediately after deploy. **Fallback (recommended for
stability):** serve the client build from EC2 nginx instead:

```nginx
root /home/ubuntu/snooker/packages/client/dist;
location / { try_files $uri /index.html; }
# /api and /socket.io already proxied above — same-origin, no CORS, no Vercel needed
```

If you go this route, you can keep Vercel as a preview/staging host only.

---

## 4. Instance choice summary

| Option | Verdict |
|---|---|
| **`t3.micro` (recommended)** | 1 vCPU / 1 GiB, free 750 hrs/mo × 12 mo; better burst credit performance than t2 for Node |
| `t2.micro` | Also free-tier eligible; older; fine as alternative |
| `t4g.micro` (Graviton) | NOT free tier — avoid |
| RDS `db.t3.micro` | Free but unnecessary; local Docker Postgres is simpler and leaves RDS budget unused |
| Vercel for the server | ❌ Impossible — Socket.IO + in-memory game rooms need a persistent process |

If you outgrow free tier: next step is `t3.small` (~$15/mo) + RDS or keep Docker DB with EBS snapshots.

---

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Server exits immediately | Missing `DATABASE_URL` / `JWT_SECRET` / `COOKIE_SECRET` (Zod refuses to boot) — check `packages/server/.env` |
| CORS errors | `CLIENT_ORIGIN` doesn't exactly match the Vercel URL |
| WS fails from Vercel | Vercel rewrite doesn't forward upgrade → use EC2-hosted frontend (§3) |
| Admin cookie not sent | `NODE_ENV=production` not set (needs `secure: true` behind HTTPS) |
| Verification codes not arriving | SMTP is not configured, so codes go to the server log — set `SMTP_HOST` (plus `SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`) |
| Anyone can register without a code | `AUTH_ALLOW_DIRECT_REGISTER` is `true` — set it to `false` in production |
| DB down | `curl /api/ready` → 503; `docker compose ps`; check `pgdata` volume |
| Migrations stale | `pnpm db:deploy` + `pnpm db:status` |

**Never** run `db:migrate` or `db:seed` repeatedly in production — `db:seed` reseeds admins.

---

## 6. Quick reference commands

```bash
# Server lifecycle
sudo systemctl restart snooker && sudo systemctl status snooker
journalctl -u snooker -f                       # live logs (pino JSON)

# DB
pnpm db:deploy                                 # apply migrations
pnpm db:backup / pnpm db:restore               # pg_dump scripts (run on EC2)

# Health
curl https://<ec2-domain>/api/health
curl https://<ec2-domain>/api/ready
```
