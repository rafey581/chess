# Deploying Chess Stake

> Infrastructure names (the `snooker` directory, `snooker.service` systemd unit,
> `snooker-postgres` container, `snooker/snooker` database login and the seeded
> `@snooker.test` emails) are kept from the original snooker build so existing
> servers keep working. Only the product changed.

The whole system, start to finish: the server on AWS EC2, the player app (Android APK,
plus an optional web version), and the staff app (Android APK). Follow the parts in order;
both apps have the server's address built in, so the server comes first.

| Piece | Where it runs | Built with |
|---|---|---|
| Server (API + game sockets) + PostgreSQL | One EC2 instance | Node 20, pnpm, Docker |
| Player app "Chess Stake" (`com.snookerx.game`) | Players' phones (APK) and optionally the web | Vite + Capacitor, built on your PC |
| Staff app "Chess Admin" (`com.snookerarena.admin`) | Staff phones (APK) | Expo, built in the cloud by EAS |

All current work is on the branch **`merge/friend-changes`**. Use that branch (or `main`
once it has been merged there).

---

## 0. Decide the server's address first

Everything points at one address. Pick it before building anything:

- **Elastic IP (quickest):** EC2 console → Elastic IPs → Allocate → Associate with the
  instance. An Elastic IP never changes; a plain instance IP changes on every stop/start,
  which is why the two apps once pointed at different servers.
  Apps then use `http://<ELASTIC_IP>:4000`.
- **Domain with HTTPS (recommended for real players):** point `api.yourdomain.com` at the
  Elastic IP and put nginx + Let's Encrypt in front (part 1.8). Apps then use
  `https://api.yourdomain.com`.

Below, `<SERVER>` means whichever you chose, e.g. `http://54.252.128.235:4000`.

---

## 1. Server on EC2

### 1.1 Launch the instance
- Ubuntu 24.04 LTS, **t3.small or larger** (t3.micro's 1 GB runs out of memory while
  building), 20 GB gp3 disk, Elastic IP attached.
- Security group inbound:
  - 22 (SSH): **your IP only**
  - 4000: 0.0.0.0/0 (the apps talk to it; close it if you use nginx + HTTPS instead)
  - 80, 443: 0.0.0.0/0 (only if you use nginx)
  - **Never open 5432.** The database login is the fixed `snooker/snooker` from
    `docker-compose.yml`.

### 1.2 Install the tools
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx docker.io docker-compose-v2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm install -g pnpm
sudo usermod -aG docker $USER && newgrp docker
```

### 1.3 Get the code and build
```bash
git clone https://github.com/rafey581/chess.git snooker && cd snooker
git checkout merge/friend-changes
pnpm install
pnpm build          # shared -> server (prisma generate + tsc) -> client web build
```

### 1.4 Configure
```bash
cp .env.example packages/server/.env
nano packages/server/.env
```
The file **must** be `packages/server/.env`. Set at least:

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET`, `COOKIE_SECRET` | each the output of `openssl rand -hex 32` (two different values) |
| `CLIENT_ORIGIN` | `http://localhost,<web address if any>`; `http://localhost` is where the player APK's requests come from |
| `MAX_STAKE` | `5000` (Master Match goes to 5000 USDT) |
| `DEPOSIT_WALLET_ADDRESS` | `7oK51mdQkub5kMsZoTMFRVpcsfcNvrGKTigu9wWbvMyR` (Solana; already the built-in default). The server will not start with an invalid Solana address |
| `DEPOSIT_CURRENCIES` | `USDT,USDC` (both on Solana, each credited 1:1) |
| `AUTH_ALLOW_DIRECT_REGISTER` | `true` (players sign up straight away; no email service is used) |
| `MIN_SIGNUP_AGE` | `18` (sign-up asks for the date of birth and refuses anyone younger) |
| `MAX_ACCOUNTS_PER_DEVICE` | `1` (one account per phone; raise to allow e.g. a shared family phone) |
| `REQUIRE_DEVICE_ID_FOR_SIGNUP` | `true` (an app too old to send its phone id is told to update before it can sign up) |
| `ADMIN_ALLOWED_IPS` | **leave empty**: staff phones on mobile data change IP constantly |
| `ADMIN_PUSH_ENABLED` | `false` (the staff app rings by itself while open; no Firebase or other service) |
| `REAL_MONEY_ENABLED` | `false` |

### 1.5 Database
```bash
pnpm db:up                                        # starts PostgreSQL in Docker
pnpm db:deploy                                    # applies every migration
SEED_ADMIN_PASSWORD='<a strong password>' pnpm db:seed   # FIRST deploy only: creates admin@snooker.test
pnpm db:status                                    # should say: up to date
```
Never run `db:seed` again on a live database, and never `db:migrate` (that is for development).

### 1.6 Run it as a service
`/etc/systemd/system/snooker.service`:
```ini
[Unit]
Description=Chess Stake server
After=network.target docker.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/snooker/packages/server
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
`WorkingDirectory` is the server package, so it finds its `.env`.
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now snooker
curl http://localhost:4000/api/health      # {"ok":true,...,"db":"up"}
journalctl -u snooker -f                   # live logs
```

### 1.7 After the first start: raise the stake ceiling
A database that was set up before Master Match stores `maxStake = 10` in its admin
settings, and that saved value wins over `.env`: every table above 10 USDT is refused
("maximum stake is 10"). In the staff app: **More → Settings → max stake → 5000**.
Check from the server:
```bash
docker exec -it snooker-postgres psql -U snooker -c "SELECT value FROM \"AppSetting\" WHERE key='maxStake'"
```

### 1.8 Optional: nginx, HTTPS and the web version
Only needed for a domain with HTTPS, or to offer the game in a browser. Follow
`deployment.md` §1.7 (proxying `/api` and `/socket.io` to port 4000 with WebSocket
upgrade) and §3 (serving `packages/client/dist`), then:
```bash
sudo certbot --nginx -d api.yourdomain.com
```
Add the web address to `CLIENT_ORIGIN`, restart (`sudo systemctl restart snooker`), and close port 4000.

### 1.9 Updating the server later
```bash
cd ~/snooker && git pull
pnpm install && pnpm build
pnpm db:deploy                    # applies new migrations (safe to run every time)
sudo systemctl restart snooker
```
Back up first: `docker exec snooker-postgres pg_dump -U snooker snooker > backup-$(date +%F).sql`.

---

## 2. Player app APK (Chess Stake)

Built on your own computer.

### 2.1 One-time setup
- Install **Android Studio** (it brings the Android SDK; the app targets SDK 35) and
  Node 20 + pnpm.
- `git clone https://github.com/rafey581/model.git && cd model && git checkout merge/friend-changes`

### 2.2 Point it at the server
Edit `packages/client/.env.app` if the server moves. It is set to `http://54.252.128.235:4000`;
for the Android emulator against a local server use `http://10.0.2.2:4000`:
```
VITE_API_ORIGIN=<SERVER>
```
(e.g. `http://54.252.128.235:4000`, or `https://api.yourdomain.com` with no port).

### 2.3 Build
```bash
pnpm install
pnpm --filter @snooker/shared build
cd packages/client
pnpm build:app          # web build with the server address baked in
npx cap sync android    # copies it into the Android project
cd android
./gradlew assembleDebug        # Windows: gradlew.bat assembleDebug
```
APK: `packages/client/android/app/build/outputs/apk/debug/app-debug.apk`. Copy it to a
phone and install (allow "install unknown apps").

### 2.4 Release build (to hand out to players)
1. Open `packages/client/android` in Android Studio.
2. Increase `versionCode` (and `versionName`) in `android/app/build.gradle` for every release.
3. **Build → Generate Signed App Bundle / APK → APK**, create a keystore, choose `release`.
4. **Back up the keystore and its passwords.** Every future update must be signed with the
   same keystore, or phones refuse to install it over the old version.

---

## 3. Staff app APK (Chess Admin)

Built in the cloud by EAS.

### 3.1 Point it at the server
In `packages/admin-app/eas.json`, `build.base.env`:
```json
"EXPO_PUBLIC_API_URL": "<SERVER>/api"
```
(note the `/api` on the end). It currently says `http://54.252.128.235:4000/api`.

### 3.2 Phone ringing
Nothing to set up. While the staff app is open, it checks for new deposit and withdrawal
requests every 10 seconds and rings (looping ringtone and a full-screen card) when one
arrives. With the app closed or in the background it does not ring: that would need
Google's Firebase push service, which this project deliberately does not use. Keep the
app open on a staff phone that is plugged in.

### 3.3 Build
```bash
npm install -g eas-cli
eas login                    # the Expo account that owns the project ("xast")
cd packages/admin-app
pnpm build:android           # "preview" profile -> an installable .apk
```
EAS prints a download link and QR code when it finishes (about 10–20 minutes).

A rebuild is needed whenever the server address, `app.json` or a native package
changes. Server-only changes never need an app rebuild.

### 3.4 First run
1. Install the APK, sign in as `admin@snooker.test` with the seed password, and change it.
2. **More → Phone alerts → Test ring.** The phone should ring until you tap Silence.

---

## Security

### Staff password
The staff login refuses the seed's default password (`admin123`), because it is public.
Set a strong one (12+ characters) on the server:
```bash
cd ~/snooker/packages/server
NEW_PASS='Your-strong-password' npx tsx --env-file=.env -e "const bcrypt=require('bcryptjs');const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const u=await p.user.update({where:{email:'admin@snooker.test'},data:{passwordHash:bcrypt.hashSync(process.env.NEW_PASS,12),failedLoginAttempts:0,lockedUntil:null,status:'ACTIVE'},select:{email:true}});console.log('Password reset for',u.email);await p.\$disconnect()})().catch(e=>{console.error(e.message);process.exit(1)})"
sudo systemctl restart snooker
```

### Demo players
Older seeds created `player@snooker.test` and `player2@snooker.test` with the default
password. Switch them off on the live database (new seeds no longer create them in
production):
```bash
docker exec -it snooker-postgres psql -U snooker -c "UPDATE \"User\" SET status='SUSPENDED' WHERE email IN ('player@snooker.test','player2@snooker.test');"
```

### What the server does
- Password reset needs a 10-minute, single-use token from the "forgot password" step;
  staff accounts can never be reset that way. A reset signs the account out everywhere.
- New passwords: 8+ characters, hashed with bcrypt (cost 12).
- Withdrawals ask for the account password every time.
- Per-address limits: login 20 per 5 min, sign-up 10 per hour, forgot/reset 5-10 per
  15 min, withdrawals 5 per 15 min, staff login 10 per 5 min, 600 requests a minute
  overall. Players also lock for 15 minutes after 5 wrong passwords.
- One account per phone (`MAX_ACCOUNTS_PER_DEVICE`).
- "Forgot password" needs every detail on the account: full name, username, email, phone
  and date of birth. Accounts made before the date of birth was asked are prompted once to
  add it; until they do, they cannot reset here and must contact support.

### HTTPS (strongly recommended before real money)
Right now the apps talk to `http://54.252.128.235:4000`: anyone on the same Wi-Fi as a
player can read their password and session as it goes past. To encrypt it:
1. Buy a domain (any registrar) and point `api.yourdomain.com` (an A record) at
   `54.252.128.235`.
2. On the server: `sudo apt install -y nginx certbot python3-certbot-nginx`, proxy
   `/api` and `/socket.io` to port 4000 (deployment.md section 1.7), then
   `sudo certbot --nginx -d api.yourdomain.com`.
3. In `packages/server/.env` set `TRUST_PROXY=true` (so limits see real addresses), restart.
4. Change `packages/client/.env.app` to `VITE_API_ORIGIN=https://api.yourdomain.com` and
   `packages/admin-app/eas.json` to `https://api.yourdomain.com/api`; rebuild both APKs.
5. Close port 4000 in the EC2 security group (only 80/443 open, 22 for your IP only).

## 4. Checklist after deploying

- [ ] `curl <SERVER>/api/health` shows `"db":"up"`
- [ ] Player APK: sign up, log in, reload stays signed in, practice starts and the robot answers a move
- [ ] A 100 USDT or Master Match table opens (proves `maxStake` was raised)
- [ ] Deposit request → staff phone (app open) rings within ~10 s → approve → player balance goes up
- [ ] Withdrawal request → balance shows it held → approve → staff pays out
- [ ] Support message from the player → appears in the staff Support tab → reply arrives
- [ ] Staff dashboard shows deposits, withdrawals and profit for Today

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Server exits at start | Missing `DATABASE_URL`, `JWT_SECRET` or `COOKIE_SECRET` in `packages/server/.env` (`journalctl -u snooker`) |
| App shows "Server offline" | Wrong address in `.env.app` / `eas.json`, port 4000 closed in the security group, or the server is down |
| "maximum stake is 10" | Raise max stake in staff app Settings (1.7) |
| Server will not start: "not a valid Solana address" | Typo in `DEPOSIT_WALLET_ADDRESS`; it must be the Solana address |
| Staff app can't sign in from mobile data | `ADMIN_ALLOWED_IPS` is set; empty it |
| Phone never rings | The staff app must be open on screen (3.2); check the volume. Try More → Phone alerts → Test ring |
| Staff app closes as soon as it opens | Rebuild the APK from the latest `main` (older builds included a push module that needed Firebase) |
| After moving the server, apps can't connect | The address is built into both apps: change it and rebuild both |
