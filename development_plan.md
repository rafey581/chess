# Chess Platform — Development Plan / Technical Specification

This document is the technical blueprint for building the platform in the base plan
(`online_multiplayer_chess_game_complete_plan.md`). It defines exactly what we build,
the stack, the folder layout, the database schema, the game engine, the realtime
protocol, the wallet/settlement system, and the build order.

> **History:** the platform was first built as a snooker game (deterministic ball
> physics, a 3D table, snooker rules). The game has since been replaced with chess;
> every other part of the platform (accounts, wallet, stakes, matchmaking,
> tournaments, progression, admin) carried over unchanged. This spec describes the
> chess build.

Build principle: everything is built and tested with **virtual credits** first.
The real-money/crypto module stays an isolated, disabled-by-default subsystem.

---

## 1. High-Level Architecture

```
                    Browser Client A                 Browser Client B
                 (render + input UI)              (render + input UI)
                          |   HTTPS / WS               |
                          +-------------+--------------+
                                        |  REST API + WebSocket (Socket.IO)
                                        v
                              ┌───────────────────┐
                              │   Node.js Server  │
                              │  (Fastify + WS)   │
                              └───┬──────┬───────┘
                     ┌────────────┼──────┼────────────┐
                     v            v      v            v
                 Auth/Users   Match/Game   Wallet    Admin
                  Service      Service     Ledger    Service
                     │            │          │          │
                     v            v          v          v
               ┌──────────────────────────────────────────┐
               │          PostgreSQL  (via Prisma)         │
               └──────────────────────────────────────────┘
                     (Redis optional later for scaling)
```

Separation of concerns (must be kept modular):

```
Game Engine  ->  Match Service  ->  Settlement Service  ->  Wallet Ledger  ->  Payment/Crypto Service
```

Rules:
- The **server is authoritative**. Clients only send moves (`from`, `to`, optional
  promotion); the server checks turn and legality, runs the clocks and broadcasts
  the resulting position.
- The **game engine is shared code** (a `shared` package) so the server, the client
  (legal-move highlighting) and the admin app (replay) use the identical rules code.
- The **wallet** never stores "one balance field". It is a ledger of transactions.
- **Crypto/deposits/withdrawals are a separate module** that stays off until legal setup is done.

---

## 2. Technology Stack

### Monorepo (npm workspaces / pnpm)
```
packages/
  shared/   pure TS: types, constants, chess rules engine, match/clock logic, practice AI
  server/   Node.js + TypeScript: REST API, Socket.IO game server, services
  client/   Vite + TypeScript: lobby UI + DOM chess board
```

### Backend
| Concern            | Choice                      |
|--------------------|-----------------------------|
| Runtime            | Node.js 20+ (TypeScript)    |
| HTTP API           | Fastify                     |
| Realtime           | Socket.IO (engine.io)       |
| ORM / DB           | Prisma + PostgreSQL 16      |
| Validation         | Zod                          |
| Auth               | Argon2 password hash, JWT in httpOnly cookie |
| Config/Secrets     | dotenv / env vars, never in source |
| Logging            | pino                         |
| Task queue (later) | BullMQ + Redis               |

### Frontend
| Concern            | Choice                      |
|--------------------|-----------------------------|
| Build              | Vite                         |
| Language           | TypeScript                   |
| UI                | React (or vanilla TS; decide on start of Phase 1) |
| Game rendering     | DOM/CSS chess board (CSS grid, Unicode piece glyphs, pointer events for click and drag) |
| Realtime client    | Socket.IO client             |
| State              | Zustand (if React used)      |

### Why a shared, pure rules engine
Server, client and admin app must never disagree about what is legal:
- The engine is pure functions over a plain position object (board array, side to
  move, castling rights, en-passant square, move counters) — no I/O, no clocks, no
  randomness.
- The server is the only authority; the client runs the same code just to offer
  legal moves and show a move instantly while the server confirms it.
- The practice AI takes an injectable random source, so its play can be seeded.

---

## 3. Repository / Folder Structure

```
root
├─ package.json
├─ pnpm-workspace.yaml
├─ docker-compose.yml            # postgres (+ redis dev)
├─ .env.example
├─ README.md
├─ docs/
│  ├─ development_plan.md        # this file
│  └─ api.md                     # full REST + WS API reference (generated)
└─ packages/
   ├─ shared/
   │  ├─ src/
   │  │  ├─ constants.ts         # stakes, formats, practice limits, app title
   │  │  ├─ rng.ts               # seeded PRNG (mulberry32)
   │  │  ├─ chat.ts              # quick-chat phrase whitelist
   │  │  ├─ progression.ts       # XP, levels, ranks, badges
   │  │  └─ chess/
   │  │     ├─ engine.ts         # board, legal moves, check/mate, draws, FEN, SAN
   │  │     ├─ match.ts          # games within a match, clocks, snapshots
   │  │     └─ ai.ts             # practice robot (alpha-beta, time budget)
   │  └─ package.json
   ├─ server/
   │  ├─ src/
   │  │  ├─ index.ts             # bootstraps HTTP + WS
   │  │  ├─ app.ts               # Fastify app, plugin wiring
   │  │  ├─ config.ts            # env validation (zod)
   │  │  ├─ db/                  # prisma client
   │  │  ├─ auth/                # register, login, guard hooks
   │  │  ├─ users/               # profile, stats, rankings
   │  │  ├─ wallet/              # ledger, balances, match accounting
   │  │  ├─ matches/             # lifecycle, escrow, settlement, history
   │  │  ├─ game/                # Socket.IO server + chess rooms
   │  │  │  ├─ index.ts          # socket events, reconnect grace, settlement hooks
   │  │  │  ├─ room.ts           # GameRoom: position, clocks, games, robot
   │  │  │  └─ throttle.ts       # move shape + flood checks
   │  │  ├─ bot/                 # practice robot wrapper
   │  │  ├─ admin/               # admin routes + RBAC guard
   │  │  └─ crypto/              # DISABLED module: deposits/withdrawals stubs
   │  └─ prisma/
   │     └─ schema.prisma
   └─ client/
      ├─ src/
      │  ├─ main.ts
      │  ├─ app/                 # auth pages, dashboard, lobby, profile
      │  ├─ chess/
      │  │  ├─ chessView.ts      # board, clocks, move list, promotion picker
      │  │  ├─ chess.css
      │  │  └─ sound.ts          # synthesised move / capture sounds
      │  ├─ game/
      │  │  └─ network.ts        # REST + Socket.IO wrapper
      │  └─ ui/                  # react components / styles
      └─ index.html
```

---

## 4. Game Design Spec (Chess)

### Board and pieces
- Standard 8×8 board; squares indexed 0 (a1) … 63 (h8); pieces as FEN letters
  (upper case white, lower case black).
- Full FIDE movement rules: castling (not out of, through or into check), en passant,
  promotion to queen/rook/bishop/knight.
- Positions travel as FEN; moves are recorded in standard algebraic notation (SAN).

### Move input (client -> server)
```ts
type MoveInput = {
  from: string;          // "e2"
  to: string;            // "e4"
  promotion?: 'q' | 'r' | 'b' | 'n'; // defaults to a queen when omitted
}
```
Server validates: the message shape (squares `a1`–`h8`, known promotion piece), the
flood limits, that it is this player's turn, that the game is running and the clock
has not run out, and that the move is legal. Then it updates the position, charges
the mover's clock, records a `MOVE` game event and broadcasts the new snapshot.

### Clocks
- 5 minutes per player per game (`CHESS_CLOCK_MS`) plus a 3-second Fischer increment
  per move (`CHESS_INCREMENT_MS`).
- Only the side to move's clock runs; the server owns it and sends remaining times
  and a deadline with every board update, so all screens count to the same moment.
- A flag fall loses the game, unless the opponent could not checkmate by any series of
  legal moves, in which case it is drawn (FIDE 6.9).
- The clock keeps running through a disconnection (as in FIDE online events); the
  reconnect grace timer decides the match if the player does not return.

### Matches
- The player chooses the game type: **Single game (BO1)** or **Best of 3 (BO3)**
  (`SELECTABLE_FORMATS`; BO5 is still accepted by the server). Tournament matches are BO3.
- FIDE scoring: 1 a win, ½ a draw, 0 a loss. The match ends as soon as one player has
  more than half the regulation points.
- Colours for game 1 are drawn by lot (seeded by the match id), then alternate.
- A level match is decided by one Armageddon game: white 5:00, black 4:00 and draw
  odds, +2 s per move from move 61. Every staked match therefore has one winner.

### Draws, resignation (FIDE)
- Automatic: stalemate, dead position, fivefold repetition, 75-move rule.
- Claimed by the player to move: threefold repetition, fifty-move rule (only a valid
  claim is accepted, so no incorrect-claim penalty is needed).
- Agreement: a player offers; the opponent accepts, declines, or declines by moving.
  One standing offer at a time; no repeat offer before making another move.
- Resignation loses the current game; forfeiting the match (`concede`) hands over the
  whole match and the stake.

### Renderer (client)
- DOM/CSS board: CSS grid of squares, Unicode piece glyphs, coordinates on the edge.
- Click-to-move and drag-and-drop; dots for quiet moves, rings for captures;
  last-move and check highlights; promotion picker.
- Player cards with clocks, games won and captured material; scrolling SAN move list.
- The board is flipped for the player with black; layout adapts down to phone width.

## 4A. Table Types / Match Modes

Three match modes share the same engine + rules + server-authoritative flow.
Only the "wrapper" differs.

```
┌─────────────────────────────────────────────────────────────┐
│                       TABLE LOBBY                           │
│  [1] 1-on-1 Match     [2] Tournament     [3] Practice (AI)  │
└──────────────┬───────────────┬───────────────┬──────────────┘
               │               │               │
       Player vs Player   Multi-player     Player vs Robot
       entry stake locked    bracket         no stake / free
       winner gets prize   winner takes     unlimited plays
                            all (pool-fee)
```

### Mode 1 — One-by-One (`ONE_V_ONE`)
- The core competitive mode. Create/join a match on a **priced table tier**
  (`$1 / $5 / $10` = `100 / 500 / 1000 CR`).
- Stake locked on entry (`available -> locked`), winner takes `pool - fee`.
- Formats: `BO1 | BO3 | BO5`.

### Mode 2 — Tournament (`TOURNAMENT`)
- Entry via a stake-free (virtual) fee currently; same escrow/settlement rules as 1v1.
- **Fixed size v1: 8 players.** Single-elimination knockout:
```
Seed 1 ─┐
        ├─ QF ─┐
Seed 8 ─┘      │
               ├─ SF ─┐
Seed 4 ─┐      │      │
        ├─ QF ─┘      │
Seed 5 ─┘            ┌┴┐
Seed 3 ─┐            │ │ FINAL  ──> Champion
        ├─ QF ─┐     │ │
Seed 6 ─┘      │     └┬┘
               ├─ SF ─┘
Seed 2 ─┐      │
        ├─ QF ─┘
Seed 7 ─┘
```
- Brackets auto-built when 8 players joined. Each round creates a normal `Match`
  (`match_type=TOURNAMENT`) using the standard engine.
- Winner takes the full prize pool after platform commission; runner-up/3rd place
  tracking (optional v1+).
- States: `DRAFT -> OPEN -> FULL -> IN_PROGRESS -> COMPLETED | CANCELLED`.
- Cancellation/abandon policies mirror 1v1 (refund others, penalize abandoner).

### Mode 3 — Practice vs Robot (`PRACTICE`)
- Player vs a **bot opponent**. `stake = 0`, nothing is locked, never touches the wallet.
- Practice limit (see R2): free, but **max 3 matches/day when the player's wallet
  balance is 0**; **unlimited when the player has balance**.
- Bot plays through the same room move path as a human (the server validates its moves identically).
- Configurable skill level: EASY / MEDIUM / HARD (search depth 1 / 2 / 3 plies and how often it deliberately plays a random move).
- Practice matches are **not** recorded in paid stats/rankings (flag on match result),
  but a light practice history is kept for UX.
- Also used as the onboarding tool: user learns the game risk-free.

### Rules for all modes
- Server-authoritative simulation and scoring no matter which mode.
- Match type recorded on `Match.matchType`.
- Monetary settlement runs **only** for `ONE_V_ONE` and `TOURNAMENT`; `PRACTICE`
  never touches the wallet.

---

## 4B. Business Rules (approved requirements — client decisions)

These decisions override any earlier draft wording. They are enforced in code, not
just documented.

### R1 — Bots can NEVER be real players
- A robot is a server-side account with `role = BOT`. It exists **only** inside
  `PRACTICE` matches.
- Bots are rejected from every real table path: bot accounts cannot create or join
  a `ONE_V_ONE` match, cannot join a `TOURNAMENT`, and cannot appear as a human
  opponent.
- Consequence: any **online table (1v1 / tournament) is always human vs human**.
  An idle/matchless human table is never filled with a bot.

### R2 — Practice vs Robot: daily limit when wallet is empty
- Practice is always free and never touches the wallet.
- If the player's **wallet available balance is 0** (no playable amount), they may
  play **at most `PRACTICE_DAILY_FREE_LIMIT = 3` practice matches per calendar day**
  (UTC day boundary).
- If the player **has a wallet balance > 0** (any amount), practice is **unlimited**.
- The daily counter counts practice matches created by that player since the start
  of the current UTC day.

### R3 — Tables priced by tier ("many tables according to price")
- 1v1 matches are organized into **stake tiers** (displayed as table prices):
  `$1`, `$5`, `$10`.
- In the current virtual-only build these map to credits: `$1 -> 100 CR`,
  `$5 -> 500 CR`, `$10 -> 1000 CR` (1 CR = $0.01). When the real-money module is
  enabled, they map to the actual USD amounts.
- The lobby shows tables split by tier; a player can only join a table whose stake
  (`stakePerPlayer`) they can cover — entry stake is locked until the result.
- Tier definitions live in `shared` (`STAKE_TIERS`) and are served by
  `GET /api/matches/tiers` so UI and server never drift.

---

## 5. Chess Rules Engine (shared, pure)

Per game:
```
GAME_START (white to move) -> move -> legal? ── no  -> refused, nothing changes
                                          └─ yes -> update position, charge clock
                                                     -> game over? ── no  -> other side to move
                                                                  └─ yes -> GAME_END
GAME_END -> winner scores a game (draw: nobody) -> next game (colours swap) or MATCH_END
```

Behaviours (`packages/shared/src/chess/engine.ts`, `match.ts`):
1. Pseudo-legal move generation for every piece, filtered by "does not leave own king
   in check"; verified against standard perft counts (start position, "Kiwipete",
   and two further reference positions).
2. Castling rights tracked and lost when the king or rook moves or a rook is captured.
3. En-passant square set after a double pawn push; capture removes the passed pawn.
4. Promotion with explicit piece choice (queen by default).
5. Game end, automatic: checkmate, stalemate, dead position, fivefold repetition and the
   75-move rule (positions compared by placement, side to move, castling rights and a
   capturable en-passant square). Claimable by the player to move: threefold repetition
   and the fifty-move rule. By agreement after an offer.
6. Loss on time, or a draw when the opponent could not checkmate (6.9); resignation
   loses the game.
7. SAN with disambiguation, captures, castling, promotion, check `+` and mate `#`.

The room emits typed game events (`MOVE` with the resulting FEN, `FRAME_END` per game
with the result, `MATCH_END`) which are persisted to `game_events` for the replay.

## 6. Database Schema (Prisma)

```prisma
model User {
  id            String        @id @default(cuid())
  email         String        @unique
  username      String        @unique
  passwordHash  String
  role          String        @default("PLAYER")  // PLAYER | ADMIN | SUPERADMIN
  status        String        @default("ACTIVE")  // ACTIVE | SUSPENDED | BANNED
  jgCheck       Json?         // jurisdiction/geo compliance snapshot
  createdAt     DateTime      @default(now())
  profile       Profile?
  wallet        Wallet?
  sessions      Session[]
  matchesA      MatchPlayer[]
  transactions  WalletTransaction[]
}

model Profile {
  id          String  @id @default(cuid())
  userId      String  @unique
  countryCode String?
  avatarUrl   String?
  bio         String?
}

// session tokens (refresh tokens)
model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String
  expiresAt DateTime
  ip        String?
  userAgent String?
}

// one row per user
model Wallet {
  id         String  @id @default(cuid())
  userId     String  @unique
  available  Decimal @default(0)   // spendable
  locked     Decimal @default(0)   // funds inside active matches / pending withdrawals
  currency   String  @default("CR") // "CR" = virtual credits; future: USDT etc.
}

// every balance change is a row
model WalletTransaction {
  id            String   @id @default(cuid())
  userId        String
  type          String   // DEPOSIT | MATCH_ENTRY | MATCH_REFUND | PRIZE | PLATFORM_FEE | WITHDRAWAL | WITHDRAWAL_FEE | ADJUSTMENT | BONUS
  amount        Decimal
  currency      String   @default("CR")
  status        String   @default("COMPLETED") // PENDING | COMPLETED | FAILED | REVERSED
  refId         String?  // related match/deposit/withdrawal id
  balanceBefore Decimal
  balanceAfter  Decimal
  meta          Json?
  createdAt     DateTime @default(now())
  userId2       String?  // counterparty (opponent), for audit
  index refId type
}

model Match {
  id            String   @id @default(cuid())
  matchType     String   @default("ONE_V_ONE") // ONE_V_ONE | TOURNAMENT | PRACTICE
  tournamentId  String?  // set when matchType = TOURNAMENT
  round         Int?     // 1=QF | 2=SF | 3=FINAL
  aiLevel       String?  // BOT_EASY | BOT_MEDIUM | BOT_HARD (when PRACTICE)
  status        String   // CREATED | WAITING_FOR_PLAYER | PLAYER_JOINED | FUNDS_LOCKED | MATCH_STARTED | MATCH_IN_PROGRESS | MATCH_COMPLETED | RESULT_VERIFIED | PRIZE_SETTLED | CANCELLED | REFUNDED | DISPUTED | ABANDONED
  stakePerPlayer Decimal
  currency       String  @default("CR")
  platformFeePct Decimal  @default(0)   // snapshot of config at creation
  format         String  @default("BO3") // BO1 | BO3 | BO5
  winnerId       String?
  resultJson     Json?   // games won + winner reason
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime @default(now())
  players        MatchPlayer[]
  events         GameEvent[]
  tournament     Tournament? @relation(fields: [tournamentId], references: [id])
}

// 8-player knockout tournament (virtual stakes in v1)
model Tournament {
  id           String   @id @default(cuid())
  status       String   // DRAFT | OPEN | FULL | IN_PROGRESS | COMPLETED | CANCELLED
  name         String   @default("8-Player Cup")
  entryFee     Decimal  @default(0)
  size         Int      @default(8)
  format       String   @default("BO3")
  championId   String?
  runnerUpId   String?
  createdAt    DateTime @default(now())
  startedAt    DateTime?
  finishedAt   DateTime?
  players      TournamentPlayer[]
  matches      Match[]
  resultsJson  Json?    // full bracket tree for UI/replay
}

model TournamentPlayer {
  id           String @id @default(cuid())
  tournamentId String
  userId       String
  seed         Int     // 1..8 bracket seed
  status       String  @default("ALIVE") // ALIVE | ELIMINATED | CHAMPION
  eliminatedIn Int?    // round reached
  tournament   Tournament @relation(fields: [tournamentId], references: [id])
}

model MatchPlayer {
  id       String @id @default(cuid())
  matchId  String
  userId   String
  seat     Int    // 0, 1
  result   String? // "WIN" | "LOSS" | "REFUND"
  playSide Json?  // final score etc.
}

// persisted game events for replay/anti-cheat
model GameEvent {
  id        String   @id @default(cuid())
  matchId   String
  seq       Int
  type      String   // MOVE | RESIGN | DRAW_OFFER | DRAW_ACCEPTED | DRAW_DECLINED | DRAW_CLAIMED | FRAME_END (one game: winnerSeat, result) | MATCH_END
  data      Json
  createdAt DateTime @default(now())
  @@unique([matchId, seq])
}

// crypto stubs (module disabled by default)
model CryptoDeposit {
  id            String @id @default(cuid())
  userId        String
  network       String
  address       String
  amount        Decimal
  confirmations Int    @default(0)
  status        String @default("PENDING")
  txHash        String?
  creditedAt    DateTime?
}

model CryptoWithdrawal {
  id       String   @id @default(cuid())
  userId   String
  address  String
  network  String
  amount   Decimal
  status   String   @default("PENDING") // PENDING | PROCESSING | COMPLETED | REJECTED | FAILED
  txHash   String?
  reviewBy String?
}

// admin boilerplate
model AdminUser    { ... admin sub-accounts behind User.role }
model AdminAction  { id, adminId, action, targetType, targetId, meta, createdAt }
model FraudFlag    { id, userId, kind, confidence, reason, createdAt }
model Notification { id, userId, kind, title, body, read, createdAt }

model KycRecord   { id, userId, status, providerRef?, submittedAt, reviewedAt, result }
```

All money math done in `Decimal` (node-pg-multicore-safe; use Prisma Decimal + `decimal.js` in TS). Never `float` for balances.

---

## 7. REST API (Phase 4+)

All responses `{ ok: boolean, data?: T, error?: string }`.

### Auth
- `POST /api/auth/register` {email, username, password} -> creates user + wallet (1000 CR starting virtual balance on dev)
- `POST /api/auth/login` -> sets httpOnly cookie
- `POST /api/auth/logout`
- `POST /api/auth/refresh`

### Users
- `GET /api/me`
- `GET /api/users/:username`
- `GET /api/me/stats` (matches, wins, winrate, highest break)
- `GET /api/leaderboard?period=week`

### Wallet
- `GET /api/wallet` -> { available, locked, currency }
- `GET /api/wallet/transactions?limit=&offset=`
- (crypto endpoints exist but return `{ enabled: false }` until module on)

### Matches
- `POST /api/matches` {type, stake, format} -> create lobby
- `GET /api/matches/lobby` -> open/created matches to join
- `POST /api/matches/:id/join`
- `GET /api/matches/:id`
- `GET /api/matches/history?mine=1`
- `POST /api/matches/:id/concede`

### Practice (Robot AI)
- `GET /api/practice/levels` -> EASY / MEDIUM / HARD
- `POST /api/practice/start` {aiLevel, format} -> creates a PRACTICE match with bot (no wallet changes)
- `POST /api/practice/:id/resign` -> end practice round

### Tournament
- `POST /api/tournaments` {name?, format?} -> create 8-player cup (free/virtual, no stake in v1)
- `GET /api/tournaments/open` -> list tournaments accepting players
- `POST /api/tournaments/:id/join`
- `GET /api/tournaments/:id` -> bracket tree, seeds, rounds, live match status
- `GET /api/tournaments/history`
- `GET /api/tournaments/leaderboard` / champion list

### Admin (RBAC: role ADMIN/SUPERADMIN)
- `GET /api/admin/stats`
- `GET /api/admin/users`, `PATCH /api/admin/users/:id` (status, adjust)
- `GET /api/admin/matches`, `GET /api/admin/matches/:id` (+ replay events)
- `POST /api/admin/wallet/adjust` (signed audit row)
- `PATCH /api/admin/settings` (commission %, min/max stake, maintenance mode)
- `GET /api/admin/fraud`

### Settings table (server config)
Stored in DB (Json/config table) so admin can change without deploy:
- commissionPct, minStake, maxStake, matchFormats[], turnTimeoutSec, reconnectGraceSec,
  maintenanceMode, allowedJurisdictions[], realMoneyEnabled(boolean, default false).

---

## 8. Realtime Protocol (Socket.IO)

Namespace: `/game`. Auth via handshake cookie/JWT.

Client -> Server:
```
match:join     {matchId}
move:play      {matchId, move: {from, to, promotion?}}
game:resign    {matchId}             // resign the current game
draw:offer     {matchId}
draw:respond   {matchId, accept}
draw:claim     {matchId}             // player to move: threefold / fifty-move
concede        {matchId}             // forfeit the whole match
match:chat     {matchId, phraseId}   // whitelisted quick-chat phrase ids only
```

Server -> Client (room of matchId):
```
match:joined    {matchId, seat, snapshot, turn}
match:start     {frameIndex, snapshot, turn}        // game 1
game:update     {frame: snapshot, events, turn}     // after every move
frame:start     {frameIndex, snapshot, turn}        // next game of a best-of
turn:clock      {turn}                              // clock paused/resumed
match:end       {winnerSeat, reason, framesWon}
opponent:disconnected | opponent:countdown | opponent:reconnected
match:chat      {seat, phraseId}
error           {code}
```

`snapshot` = `{fen, whiteSeat, turnSeat, moves (SAN), lastMove, inCheck, result,
winnerSeat, clocksMs, armageddon, drawOfferBy, drawClaim}`; `turn` =
`{turnDeadlineAt, clocksMs, turnSeat, paused, serverNow}`; board-carrying events also
carry `framesWon` (match points, halves for draws).

Server-authoritative loop:
1. Receive `move:play`.
2. Check the message shape and flood limits.
3. Check seat, turn, game running, clock not expired, move legal.
4. Apply the move, charge the mover's clock (plus increment), detect game end.
5. Persist the `MOVE` (and any `FRAME_END`) event; broadcast `game:update`.
6. If the game ended: score it; after a short pause start the next game
   (`frame:start`) or end the match (`match:end`) and trigger settlement.

Client rendering: the board shows a move the moment the player makes it and is
corrected by the next snapshot; a refused move is taken back.

Reconnect/disconnect handling:
- On disconnect, room marks player `DISCONNECTED`, starts grace timer (`reconnectGraceSec`).
- Reconnect restores the board and clocks from the current snapshot. The clock keeps running while a player is disconnected.
- After timeout -> `ABANDONED` -> rules: opponent wins, funds settled per policy (virtual: refund opponent, confiscate abandoner to platform in real-money mode; disabled in dev with REFUND).

---

## 8A. Bot AI Opponent (Practice Mode)

The robot is implemented as another "player" in the room. Its moves go through the
same room move path as a human's, so they are validated identically.

```
BOT TURN (server-side):
  1. Wait a short "thinking" delay (BOT_MOVE_DELAY_MS).
  2. Search the position with alpha-beta (material + piece-square tables,
     capture-only quiescence search, repetition and fifty-move awareness).
  3. Deepen one ply at a time up to the level's depth, inside a ~350 ms budget,
     keeping the best move of the deepest finished search.
  4. Play the move through the normal room path.
```

| Level    | Search depth | Random move chance |
|----------|--------------|--------------------|
| EASY     | 1 ply        | 30%                |
| MEDIUM   | 2 plies      | 8%                 |
| HARD     | 3 plies      | 0%                 |

Constraints:
- Bot never touches the wallet; `stake = 0`, no `MATCH_ENTRY`, no payout.
- Bot is role `BOT` and is **never** a real player in 1v1/tournament tables (R1).
- Thinking is capped (~350 ms) because the search runs on the server's event loop; a fixed delay makes the reply feel natural.
- Practice matches excluded from rankings/leaderboards (`matchType=PRACTICE`
  filters stats queries).
- Practice plays/day limited only when the player has zero balance (R2).

---

## 9. Wallet & Settlement (the critical financial part)

### Ledger invariants
- `available + locked` always equals sum of wallet transactions' deltas (audit query to verify).
- No mutation of `available` without a `WalletTransaction` row. Use DB transaction.
- Concurrency: lock the wallet row (`FOR UPDATE`) before changes.

### Match accounting flow (virtual credits first)
```
match created:  debit MATCH_ENTRY (-stake) available -> locked
opponent joins: same for B
match starts
winner decided (server):
   winner:  credit PRIZE (+stake*(2 - feePct))   [from locked]
   platform: credit PLATFORM_FEE (+stake*feePct) to ADMIN wallet txn
  both locked amounts consumed
cancelled pre-start: refund (MATCH_REFUND) locked -> available for both
```

### Commission model (configurable)
```
Pool = stake * 2
PlatformFee = Pool * commissionPct   (e.g. 10%)
WinnerPrize = Pool - PlatformFee
```
Edge cases: odd rounding (use floor/round to 8 dp, document rule), abandoned match policy.

### Settlement service
Runs inside the same DB transaction that commits the match result. Idempotency:
- `match.status: MATCH_COMPLETED` must be guarded; only transition to `PRIZE_SETTLED`
  once per match (unique `refId` on transactions, `wallet_transactions.refId` unique where type in MATCH_ENTRY/PRIZE/...).

---

## 10. Anti-Cheat & Fairness

Implementation (in order):
1. Server-authoritative rules (nothing trusted from the client except the move it wants to play).
2. Input validation + rate limiting per socket + per-user.
3. Chess clocks enforced server-side; a move that arrives after the flag fell loses on time.
4. Malformed or flooding move traffic is counted and raised as a fraud flag.
5. Multi-account detection: IP/device fingerprint, same device co-login, referral anomalies.
6. Win-rate / stake anomaly monitoring -> `FraudFlag` + auto-restrict thresholds.
7. Full `GameEvent` log per match -> replay + audit + dispute resolution.
8. Anti-cheat tuning happens after enough real gameplay data (dev tournaments).

---

## 11. Compliance / Jurisdiction Module (design hooks only)

- `User.jgCheck` snapshot: geo, VPN/proxy detection result (client IP + `ipinfo` style lookup)
  stored at registration and re-checked at match entry.
- `allowedJurisdictions` config enforced server-side at deposit/match-entry/withdrawal.
- `KycRecord` + `KycProvider` interface stub (no provider configured by default).
- `realMoneyEnabled` flag gates: deposit endpoints, kyc enforcement, non-CR currency.
- Real-money mode = strictly opt-in config; until legal setup done it stays **false**.

---

## 12. Crypto Module (stub, disabled)

Interfaces defined, implementations empty until a licensed jurisdiction/provider exist:
```
DepositProvider  { generateAddress(network): Promise<string>; confirm(tx): Promise<...> }
WithdrawalProvider { submit(to, amount, network): Promise<{txHash}> }
MonitorService  (poll or webhook) -> marks deposits confirmed -> ledger credit
```
Nothing here can be turned on by a client; it requires server config + env secrets.

---

## 13. Build Order (Milestones)

### M0 — Scaffold (day 1)
- Monorepo, lint/format/tsconfig, docker-compose (postgres), Prisma schema, .env.example.
- CI-less local `pnpm -r dev`.

### M1 — Shared chess engine
- Board, move generation, legality, FEN/SAN.
- Perft tests against standard reference positions.

### M2 — Game end and match flow
- Checkmate, stalemate, automatic draws, clocks, best-of games, colour alternation.

### M3 — Board UI
- DOM board, click/drag moves, legal-move hints, promotion picker, clocks, move list.

### M4 — Auth + users + wallet ledger
- Register/login, profiles, wallet + transactions API (virtual CR).
- Starting virtual balance for dev.

### M5 — Singleplayer vs AI (optional but very useful)
- AI plays via the same room move path; proves engine end-to-end.

### M6 — Multiplayer realtime
- Socket.IO rooms, turn system, clocks, snapshots, disconnect/grace.
- Matches + match history + concession (Mode 1: 1v1 complete).

### M6b — Practice mode (Robot AI)
- Bot loop + skill levels, no-wallet PRACTICE matches, unlimited free plays.
- Bot also doubles as an M5 AI for engine testing.

### M6c — Tournament mode
- 8-player bracket builder, join flow, per-round match creation, bracket UI,
  champion tracking, pool/fee settlement.

### M7 — Admin panel
- Stats, users, matches+replay, settings (commission, stakes, maintenance).

### M8 — Anti-cheat + audit hardening, leaderboards, notifications.

### M9 — Polishing: sounds, animations, responsive UI.

### M10 — Production: deploy, backups, monitoring, scaling.
### M11 — Legal gate (NOT dev): enable jurisdiction checks, KYC provider, crypto provider.

Acceptance per milestone = automated tests pass + feature demo-able.

---

## 14. Testing Strategy

- **Shared engine**: perft counts, rule scenarios (castling, en passant, promotion, draws), seeded AI tests.
- **REST**: Fastify `inject` tests + Prisma test DB (transactions rolled back).
- **Realtime**: room unit tests with fake timers, plus `pnpm e2e` driving real Socket.IO
  clients through a staked checkmate, practice and a resignation.
- **Wallet**: property tests for invariants (`available+locked == ledger sum`),
  concurrency test (two join actions), idempotency test (settle twice = once).
- **E2E (later)**: Playwright for lobby->match->result on virtual credits.

---

## 15. Environment / Config

Loaded from `packages/server/.env` (see `.env.example`). `DATABASE_URL`, `JWT_SECRET`
and `COOKIE_SECRET` are required (>=16 chars for the secrets); the server refuses to
start without them.

```env
DATABASE_URL=postgresql://snooker:snooker@localhost:5432/snooker
JWT_SECRET=<random, >=16 chars, required>
COOKIE_SECRET=<random, >=16 chars, required>
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
LOG_LEVEL=info
CR_START_BALANCE=1000
MATCH_TURN_TIMEOUT_SEC=60
MATCH_RECONNECT_GRACE_SEC=120
COMMISSION_PCT=0.10
MIN_STAKE=100   # lowest stake tier ($1 table -> 100 CR)
MAX_STAKE=1000  # highest stake tier ($10 table -> 1000 CR)
REAL_MONEY_ENABLED=false
```

---

## 16. Decisions Pending (open questions)

1. React vs vanilla TS for UI — decided: vanilla TS.
2. Board rendering — decided: DOM/CSS board (no canvas or WebGL needed for chess).
3. AI opponent — confirmed: required for Practice mode.
4. Time control — 5+3 for every table today; per-tier or per-match time controls could be added later.
5. Draw offers — implemented per FIDE 9.1 (offer, accept, decline by moving).

---

## 17. Definition of Done (MVP)

A user can:
- register/login,
- see a starting virtual balance,
- play practice vs the Robot (EASY/MEDIUM/HARD) — free, up to the daily limit
  (3/day when balance is 0, unlimited when balance > 0),
- create/join a 1v1 match at a chosen stake,
- create/join an **8-player knockout tournament** and play its rounds,
- play a full chess game (or best-of-3 / best-of-5) vs another real user in realtime,
- have the server enforce legal moves, clocks and game results correctly,
- see match end, winner, and correct virtual-credit prize/commission transactions in history
  (1v1 + tournament only; practice never touches the wallet),
- admin can configure commission/stakes, view matches + transaction audit, and manage tournaments.

No real-money path is reachable.