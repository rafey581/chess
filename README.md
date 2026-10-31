# Chess Platform

Online multiplayer chess platform. Real-time 1v1 matches, 8-player knockout
tournaments and free robot-AI practice, backed by a server-authoritative chess
rules engine and a ledger-based wallet.

> This project began as a snooker platform. The game itself has been replaced with
> chess; the lobby, wallet, stakes, matchmaking, friends, referrals, tournaments,
> progression, notifications, support and the staff app are unchanged. Internal
> package names (`@snooker/*`), bundle ids and storage keys were kept so existing
> builds and installs keep working.

> Balances are held in **USDT at 1:1**: deposits credit exactly what was sent, and
> stakes/payouts are quoted in USDT. The real-money path (`REAL_MONEY_ENABLED`) stays
> disabled until legal & licensing setup is complete, so today this is a fully
> demonstrable, offline bookkeeping economy denominated in USDT.

See also:
- `development_plan.md` — technical specification
- `online_multiplayer_chess_game_complete_plan.md` — base project plan (product, wallet, compliance)
- `product_showcase_client_review.md` — client-facing product overview
- `RUNBOOK.md` — boot, migration, backup/restore and monitoring procedures

## Structure

```
packages/
  shared/     chess rules engine, match/clock logic and practice AI (shared by server, client & admin)
  server/     Node.js API, Socket.IO game server, wallet/settlement, admin
  client/     Vite browser app (game renderer + UI)
  admin-app/  Expo (React Native) staff app - the only admin surface
```

## Stakes

Open tables: **1, 5, 10, 20, 50, 100 USDT**. Master Match: **500, 1000, 2000, 3000, 5000 USDT**.

## How a match is played

- **Rules** — full chess: castling, en passant, promotion (with a picker), check,
  checkmate and stalemate. Stalemate, threefold repetition, the fifty-move rule
  and insufficient material are drawn automatically. The rules engine lives in
  `packages/shared/src/chess/engine.ts` and is checked against standard perft counts.
- **Formats** — single game (BO1), best of 3 or best of 5. Each game takes the
  place a frame used to: colours alternate every game (the table opener has white
  in game 1), and the first player to win the required games takes the match and
  the stake. A drawn game scores nothing and is replayed.
- **Clock** — 5 minutes per player per game, plus 3 seconds after every move
  (`CHESS_CLOCK_MS` / `CHESS_INCREMENT_MS`). Running out of time loses the game.
  A player who disconnects has their clock paused and gets the reconnect grace
  period; after that the match is awarded to the opponent, as before.
- **Resign** — concedes the whole match (and the stake).
- **Server authority** — clients send `move:play { from, to, promotion? }`; the
  room validates turn and legality, runs the clocks and broadcasts the position
  (FEN, SAN move list, last move, clocks). Every move is stored as a `MOVE`
  game event carrying the resulting FEN, which drives the admin replay.
- **Practice robot** — alpha-beta search over material and piece-square tables
  (`packages/shared/src/chess/ai.ts`). EASY looks 1 ply ahead and often blunders,
  MEDIUM 2 plies, HARD 3 plies, each within a ~350 ms budget so it never stalls
  the game server.

The stake ceiling is an admin setting (`maxStake`, default 5000). A database set up with
the old default of 10 refuses every table above 10 USDT until it is raised in the admin
app (More → Settings).
Both use the same virtual ledger freeze and settlement. `REAL_MONEY_ENABLED` stays
`false`, so crypto deposits and withdrawals stay gated off. A new account still
starts with 1 USDT; a Master Match needs a balance that covers the stake.

The post-login home hall (not the sign-in screen) cycles its glow through red,
blue, and gold. `prefers-reduced-motion` holds it on the blue hall.

## 1v1 matchmaking

Online play is invitation-based rather than a browsed table list:

- **Public table** — when a player opens a staked table, it is broadcast to every
  connected player. Accepting the popup freezes both stakes and starts the match at
  once; the offer expires after ~90 seconds if nobody takes it.
- **Friend invite** — the player may instead invite a friend directly (from the
  Play setup screen or the FRIENDS screen). Only that friend is offered the table.

Nothing is staked while a table waits: both sides are frozen atomically at accept,
so an invitation nobody takes never holds anyone's balance. Offline players are not
offered public tables.

## Invitations (referral programme)

Every account carries one unique invite code and a shareable link
(`/signup?ref=CODE`). A new player arrives through the link (the code pre-fills
the signup form) or types a friend's code into the optional **Invite code** field;
either way the inviter is recorded on the new account.

- **Welcome grant** — a new account starts with `START_BALANCE` = **1 USDT**.
- **Referral bonus** — the inviter earns **1 USDT** (`REFERRAL_BONUS_USDT`) when
  the invited player finishes their first real match. Nothing is paid at signup,
  and the reward is paid once per invitee (the match gate + a one-time stamp make
  it race-safe). A vs-AI practice match only counts with
  `REFERRAL_COUNT_PRACTICE=true`.
- The home screen **INVITE** tile shows the code, a copy/share button, and a
  live list of invited players (signed up → first match played), plus the USDT
  earned so far.
- Anti-abuse: codes are unique, self-referral is refused, bad codes are answered
  with an error at signup, and signup already demands a unique email address
  verified by an emailed one-time code.

## Quick Start

```bash
pnpm install
pnpm db:up                # starts postgres (docker compose)
cp .env.example packages/server/.env   # then set DATABASE_URL + real secrets
pnpm db:deploy            # apply migrations (non-interactive, for any environment)
pnpm db:seed              # first-boot users (admin, player, player2)
pnpm dev                  # runs server + client in watch mode
```

- Client: http://localhost:5173
- Server: http://localhost:4000 (health: `/api/health`, readiness: `/api/ready`)

## Admin app

Staff do their work from `packages/admin-app`, an Expo (React Native) app — the
web client is player-only and exposes no admin surface. It covers the dashboard,
deposit and withdrawal review, users (role, status, balance adjustments),
matches with a move-by-move replay, settings, fraud/ledger checks and the
audit log.

```bash
pnpm --filter @snooker/admin-app start   # then press i / a, or scan with Expo Go
```

The app signs in with the admin email + password. It talks to the server on
port 4000: by default it reuses the Expo dev server's host, so a phone on the same
network needs nothing configured. Point it elsewhere with
`EXPO_PUBLIC_API_URL=http://host:4000/api` in `packages/admin-app/.env`. The
seeded admin account is created by `pnpm db:seed`.

### Player app (Android debug APK)

The playable client is Chess Stake, a Capacitor app in `packages/client` (`com.snookerx.game`).
A debug APK is built with the JDK and Android SDK (compile/target SDK 35):

```bash
# Emulator default: the host machine is 10.0.2.2. A phone on your LAN needs that
# machine's address instead, then the same two commands.
#   VITE_API_ORIGIN=http://192.168.1.20:4000
cd packages/client
pnpm build:app          # reads packages/client/.env.app (VITE_API_ORIGIN)
pnpm cap:sync
cd android && ./gradlew assembleDebug
```

`VITE_API_ORIGIN` is baked in at build time. The checked-in `.env.app` points at
`http://10.0.2.2:4000`, which is the Android emulator's alias for the computer
running the API. Change that one line and rebuild to aim a handset at another host.
The API still has to be reachable, and `REAL_MONEY_ENABLED` is unchanged.


### Staff app (Android APK via EAS)

`packages/admin-app/eas.json` defines a `preview` profile that produces a
directly installable `.apk`. EAS builds in the cloud, so no Android SDK or Java
is needed locally:

```bash
cd packages/admin-app
npx eas-cli@latest login                      # once, with your Expo account
npx eas-cli@latest init                       # once, links the project
npx eas-cli@latest build -p android --profile preview
```

When the build finishes, scan the QR code on the build page or download the
`.apk` and install it (Android may ask you to allow "install unknown apps").

A standalone build cannot guess the server address the way Expo Go does (there
is no Metro dev server to read), so the URL is baked in at build time from
`EXPO_PUBLIC_API_URL` in `eas.json` — currently `http://54.252.128.235:4000/api`.
Change it there and rebuild if the server moves. The phone must be able to reach
that host, so the server has to be running and the port reachable.

The server speaks plain HTTP, so the Android build turns on cleartext traffic
(the `expo-build-properties` plugin in `app.json`); without it a release APK
fails to reach the API with no visible error.

## Useful Scripts

```bash
pnpm test          # run all tests (chess engine, rooms, services)
pnpm typecheck     # typecheck all packages
pnpm build         # build all packages
pnpm e2e           # full end-to-end suite (needs a running server; mutates dev DB)
pnpm db:backup     # Postgres custom-format dump -> backups/
pnpm db:restore -- -File .\backups\snooker-<timestamp>.sql
```

## Environment Variables

Copy `.env.example` to `packages/server/.env` and fill in real values.
`DATABASE_URL`, `JWT_SECRET` and `COOKIE_SECRET` are required — the server refuses
to boot without them. Never commit real secrets. Full reference: `RUNBOOK.md` §2.

## License / Compliance

Real-money wagering is regulated activity. The crypto/real-money module is
built but disabled (`REAL_MONEY_ENABLED=false`) and must not be enabled without
licensed legal setup in the target jurisdiction.