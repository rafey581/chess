# Chess Platform — Development Process (Day-by-Day)

> **Game change:** the platform was built and developed as a snooker game through the
> sessions recorded below (Day 1 – Day 27, U1). The game has since been replaced with
> chess (session **C1**). The day-by-day records are kept unchanged as the history of
> what was built and verified at the time; physics, 3D renderer, shot and frame details
> in them describe the snooker game, which no longer exists in the code. Everything else
> they describe (wallet, matchmaking, tournaments, admin, ops) is still current.

This file defines **how** we build the Chess Platform: slowly and steadily,
one well-sized piece per working session ("day"). It is the control document
for the whole project.

- `development_plan.md` = the **technical spec** (what we build).
- `product_showcase_client_review.md` = the **product overview** (what the client approved).
- `development_process.md` = **this file** (how we build it, day by day).

Rule of thumb: we never rush. One phase per session. We finish it, verify it,
mark it done, and stop. Then you tell me which phase to do next.

---

## 1. How We Work (rhythm)

1. **One phase per session.** Each phase below is sized to fit in a single
   dedicated working session. No skipping ahead, no multi-phase marathons.
2. **Slow and steady.** If a phase turns out too big, we split it into two
   sessions and track the split here, rather than powering through.
3. **Verify before moving on.** A phase is only "done" when its automation
   passes (see section 3). We do not start the next phase on a red build.
4. **You drive.** You say "work on Day N / Phase X" (or just "next phase"),
   I do only that phase, verify it, update the tracker, and report back.
5. **No gold-plating.** Anything outside the phase scope goes to the Parking
   Lot (section 8). Engineering conventions stay fixed (see section 2.3).

## 2. Session Format

### 2.1 At the start of every session (what I do)

- Read this file's tracker and the current phase's write-up.
- Read the relevant spec sections in `development_plan.md`.
- Check the current state of the code and the running environment
  (DB up, migration applied, dev servers stopped/started as needed).
- State a short plan: scope for this session + how I will verify it.
- Reflect the plan in the working todo list.

### 2.2 At the end of every session (what I do)

- Run the verification / regression commands that apply (section 4).
- Update the status tracker in this file (mark the phase, add notes).
- Report back in a few lines: what changed, test results, what's next.

### 2.3 Standing engineering conventions (never change silently)

- **No comments in code** unless the user asks for them.
- Server-authoritative game; client renders server snapshots only.
- Deterministic engine: fixed timestep, seeded RNG only, no `Math.random()` in simulation.
- Decimal math for all money/wallet values; ledger rows for every balance change.
- Virtual credits first. Real-money path stays disabled (`REAL_MONEY_ENABLED=false`).
- New package deps must be added consciously and only when needed.
- Any new behavior that the client approved must also be reflected in the
  product/plan docs.

---

## 3. Definition of Done (per phase)

A phase is done when **all** of the following are true:

- [ ] Scope from `development_plan.md` / this file is implemented.
- [ ] Typecheck passes for the affected packages (`pnpm typecheck`).
- [ ] Shared tests pass (`pnpm --filter @snooker/shared test`).
- [ ] The E2E regression suite still passes
      (`pnpm --filter @snooker/server exec tsx scripts/e2e.ts`) — run always after backend changes.
- [ ] For gameplay/rules work: a real full-frame/full-match simulation was
      executed and observed, not just believed to work.
- [ ] The status tracker below is updated and this session is summarized to the user.

---

## 4. Regression Guardrails (always run before closing a session)

```bash
pnpm --filter @snooker/shared test                      # physics/rules unit tests
pnpm typecheck                                          # all packages
pnpm --filter @snooker/server exec tsx scripts/e2e.ts   # API + realtime E2E (62 checks)
```

Environment checks when starting work after a break:

```bash
docker compose ps                                        # postgres + redis up?
pnpm --filter @snooker/server exec prisma migrate status # schema in sync?
pnpm db:seed                                             # dev accounts (admin/player/player2, admin123)
```

---

## 5. Progress Tracker (master status)

Legend: `DONE` = built and verified · `PART` = works but incomplete · `TODO` = not started · `HOLD` = deferred

| # | Phase (day) | Area | Status |
|---|-------------|------|--------|
| 1  | M0 Scaffold | monorepo, docker, prisma, seed | DONE |
| 2  | M1 Physics engine | world/collision/cushion/pocket/substeps | DONE (8 tests) |
| 3  | M2 Rules engine | red/colour cycle, fouls, frame/match | DONE (audit + tests, Day 11) |
| 4  | M3 Renderer | canvas table, cue, aim, spin | DONE — 2D + full 3D renderer (Day 17b), polish + game feel (Day 25) |
| 5  | M4 Auth + wallet ledger | register/login, wallet, transactions | DONE |
| 6  | M5 Single-player vs AI | bot through shot path | DONE |
| 7  | M6 Multiplayer realtime | rooms, snapshots, concede, E2E | DONE (socket flow verified) |
| 8  | M6b Practice mode | robot, 3/day limit (R2), no wallet | DONE (E2E verified) |
| 9  | M6c Tournament backend | create/join/bracket/settle | DONE (drain E2E verified; UI pending Day 17) |
| 10 | M7 Admin (server only) | admin routes, RBAC | PART — admin UI + settings infra pending (Day 20-21) |
| 11 | Day 11 — Rules engine audit + full-frame fix | shared | DONE (17 rules tests, E2E 62/62) |
| 12 | Day 12 — Bot skill levels (EASY/MEDIUM/HARD) | shared + server | DONE (pot-rate ordering, bot tests, 2 engine bugs fixed, E2E 62/62) |
| 13 | Day 13 — Full-match E2E (no concedes) | server | DONE (natural-finish BO3 via sockets, 2 engine bugs fixed, E2E 72/72) |
| 14 | Day 14 — Lobby UX: tiered tables $1/$5/$10 | client | DONE (tier tabs, tier picker, join/empty states via GET /api/matches/tiers) |
| 15 | Day 15 — Match UI/UX + realtime feel | client | DONE (match strip, toasts, concede, overlay, HUD) |
| 16 | Day 16 — Tournament drain E2E + hardening | server | DONE (8-join drain to champion, 3 backend fixes, E2E 116/116) |
| 17 | Day 17 — Tournament UI: bracket, join, champion | client | DONE (bracket screen, create/join/live Play, champion ceremony) |
| 17b | 3D table renderer (client review follow-up) | client | DONE (Three.js scene, WebGL, verified headless) |
| 25 | Day 25 — Renderer polish + game feel (3D) | client | DONE (see Day 25 section; full polish delivery below) |
| 18 | Day 18 — Profile, stats, leaderboards | server + client | DONE (GET /api/me, /api/leaderboard, break tracking, lobby stats card, E2E 116/116) |
| 19 | Day 19 — Notifications | server + client | DONE (Notification model + migration, /api/notifications + mark-read, socket user rooms + live emit, bell/badge/panel, wired join/settle/practice/champion, E2E 125/125) |
| 20 | Day 20 — Admin panel UI | client | DONE (GET /api/admin/actions audit feed, Admin button gated by role, 5-tab panel: dashboard stats, users status/role + wallet adjust, matches + replay events, settings editor, audit log; E2E 140/140) |
| 21 | Day 21 — DB-backed settings + maintenance mode | server | DONE (settings loader w/ TTL cache + seed, stake/commission/format validation reads settings live, fastify 503 maintenance gate + socket guard, admin login during maint, public status endpoint, maintenance overlay/banner + admin toggle; E2E 169/169) |
| 22 | Day 22 — Reconnect & disconnect policy | server + client | DONE (room seat sockets tracked per seat, disconnected flag + broadcasts, reconnectGraceSec grace timer, reconnect replays missed GameEvents by seq, timed-out single abandon settles to opponent / double-disconnect refunds, settled-match rejoin returns match:end; client opponent-gone banner + reconnect toasts; E2E 193/193 + headless demo) |
| 23 | Day 23 — Turn timers, rate limits, input hardening | server | DONE (server-side turn timer auto-foul via applyTimeoutFoul, per-socket + per-user token-bucket rate limits, shot input schema validation (aim/power/spin/cuePos), timestamp-drift + duplicate-shot replay checks, admin-tunable turnTimeoutSec; E2E 212/212) |
| 24 | Day 24 — Audit: replay viewer, fraud flags, ledger invariants | server + client | DONE (see Day 24 section; e2e 228/0, invariant green) |
| 25 | Day 25 — Renderer polish + game feel | client | DONE — full polish delivered (see Day 25 section; e2e 228/0) |
| 26 | Day 26 — Client interp, perf, resilience | client (+1 shared engine line) | DONE — 2D fallback lerp, allocation-free engine hot path, texture/line caches, adaptive DPR, render-loop guard + err-chip + offline overlay, three/socketio chunk split + lazy admin, a11y live regions (see Day 26 section; e2e 228/0) |
| 27 | Day 27 — Production readiness (ops, no real deploy yet) | all | DONE — env templates + fail-fast config, db:deploy/status for migration order, real /api/health + /api/ready probes, structured pino logs + redaction + graceful shutdown, recoverMatchValidity wired, SQLite->Postgres pg_dump backup/restore scripts, RUNBOOK.md + README/plan doc fixes (see Day 27 section; e2e 228/0) |
| 28 | Day 28 — Final review vs Definition of Done + full regression | all | TODO |
| U1 | U1 Client redesign 1 - A: home screen (single viewport, 3 cards, 5-entry bar), B: pre-practice setup screen | client (+1 shared constant) | DONE - 2 commits (0edb9a9, d1048e6); typecheck clean, client tests 308/308, build green |
| C1 | C1 Game change: snooker replaced with chess | all | DONE - commit fd69c21 (see C1 section); shared 38, server 132, client 109, admin 33 tests green; e2e 18/18 |
| C2 | C2 FIDE rules, game-type choice, tournament fix | all | DONE (see C2 section); e2e 43/43 incl. a full 8-player tournament |

> Current focus: **C1 — the game is now chess** (rules engine, clocks, rooms, board UI,
> practice robot, admin replay). Next planned phase: **Day 28 - Final review vs
> Definition of Done + full regression**, now against the chess game.
---

## 6. Completed Sessions (record, for reference)

### C2 · FIDE Laws, game-type choice, tournament check (verified)

Goal: make every game follow the FIDE Laws of Chess, let the player choose single game
or best of 3, and check the tournament feature end to end.

Built:
- Draws per FIDE: fivefold/75-move automatic; threefold/fifty-move claimed by the
  player to move; draw offers (accept, decline, declined by moving, no repeat offers).
- Flag fall is a draw when the opponent cannot checkmate (6.9); resignation loses the
  game (forfeiting the whole match is a separate choice); clock keeps running on
  disconnect; colours by lot.
- Scoring 1 / ½ / 0 with an Armageddon tie-break (5:00 v 4:00, draw odds to black,
  +2 s from move 61) instead of replaying drawn games.
- Game type: Single game / Best of 3 on the setup screen for practice and online
  (`SELECTABLE_FORMATS`); practice start accepts the format.
- **Bug fixed (pre-existing):** two tournament matches ending at the same moment
  overwrote each other's bracket result, so later rounds (the final) were never
  created. Bracket updates are now queued per tournament; a regression test reproduces
  the race and fails without the fix.

Verified: shared, server (with DB), client and admin tests green; `pnpm e2e` 43/43
(staked checkmate + settlement, FIDE draw offer → ½–½ → Armageddon, BO3 practice, full
8-player BO3 tournament to champion and runner-up); browser check of the game-type
choice, BO3 practice and a draw offer declined by the robot.

### C1 · Game change: snooker replaced with chess (verified)

Goal: replace the snooker game with chess and leave every other feature unchanged.

Built:
- **shared** — `chess/engine.ts` (legal moves, check/mate/stalemate, castling, en
  passant, promotion, repetition, fifty-move, insufficient material, FEN, SAN),
  `chess/match.ts` (games inside a best-of match, colours alternating, drawn games
  replayed, 5+3 clocks, snapshots), `chess/ai.ts` (alpha-beta robot, EASY/MEDIUM/HARD,
  ~350 ms budget). Snooker physics and rules removed.
- **server** — chess `GameRoom` (server clocks, flag fall, clock paused while the side
  to move is disconnected, next game after a pause, resignation), `move:play` socket
  event with shape and flood checks, robot wrapper, `scripts/e2e.ts` rewritten for chess.
- **client** — DOM chess board (`src/chess/`): click or drag, legal-move hints,
  promotion picker, clocks, move list, captured material, board flipped for black;
  lobby copy, rules/help, loading screen and artwork switched to chess; unused 3D
  table, cue, camera and playback code and assets removed.
- **admin-app** — move-by-move replay on a chess board.
- Fixed a duplicate `dateOfBirth` field in `schema.prisma` that stopped `prisma generate`.

Verified:
- Perft counts on four reference positions; 38 shared, 132 server (with a database and
  `ADMIN_PUSH_ENABLED=true`), 109 client and 33 admin tests green; all packages typecheck.
- `pnpm e2e` 18/18: staked BO1 decided by checkmate with settlement (winner 1 → 1.8 USDT,
  loser 1 → 0), illegal/out-of-turn/malformed moves refused, robot reply in practice,
  resignation.
- In a browser: practice game against the robot (click and drag moves), a two-browser
  1 USDT match ending in checkmate with correct result screens, phone layout at 390 px.

### Day 1 – 10 · Foundation (all verified at the time)
- Monorepo + pnpm workspaces; `shared` / `server` / `client` layout.
- Docker: Postgres 16 + Redis 7; Prisma schema + migration `init` + seed
  (admin/player/player2, password `admin123`).
- Deterministic physics: world simulation with velocity-based sub-stepping
  (no ball tunneling), collision/cushion/pocket, cue/english model; 8 unit tests green.
- Rules engine core: red → colour → re-spot, fouls/penalties, frame + best-of match,
  frame winner normalization.
- Server: Fastify + Socket.IO, JWT (httpOnly cookie + Bearer), wallet ledger with
  `FOR UPDATE` row locks, match escrow/settlement with platform commission,
  match/practice/tournament services, admin server routes, bot service.
- Client: auth screens, lobby (create/join), practice card, game view with canvas
  table + aim/power/spin controls, socket wiring.
- Env/config fixed (boolean coercion), Fastify plugin versions aligned to v5.
- **Business rules R1/R2/R3 implemented and E2E-verified.** Bots never real players;
  practice max 3/day at zero balance (unlimited with balance); stake tiers
  `$1 / $5 / $10` (100/500/1000 CR) with `GET /api/matches/tiers`.
- E2E suite `packages/server/scripts/e2e.ts` spans auth, tiers, stake locks, socket
  realtime flow, both settle paths, bot guards (HTTP + service), practice limit,
  robot shot delivery, tournament create/join — **62 checks passing**.

### Day 11 · Rules engine audit + full-frame fix (verified)
- Audited `rules/snooker.ts` + `rules/frame.ts`; found and fixed 6 real bugs + 1
  cosmetic:
  - F1/F2: balls potted in a **foul** stroke now re-spot (incl. reds); potted reds
    no longer vanish or decrement `remainingReds` on a foul.
  - F3: potting a colour while red is on is now a foul (it scored as legal before).
  - F4: potting the colour-on **plus** another colour is now a foul; the extra ball
    no longer leaves the table un-re-spotted.
  - F5: tie-frame re-spot of black now actually un-pots + re-places the black ball
    (it stayed `potted=true` and unplayable).
  - F6: cue ball is re-spotted to the D after a potted-cue foul (game used to break).
  - F11: colours potted legally while reds remain are re-spotted (they vanished).
  - Cosmetic: `COLOURING_UP` phase now set; `nextBallOnAfterVisit` simplified.
- Refactor: extracted `maybeEndFrame(frame)` and `respotBall(frame, id)` in
  `shared`; added spot helpers in `physics/layout.ts` (`cueStartPosition`,
  `colourSpotPosition`, `redSpotPosition`, `ballSpotPosition`).
- Tests: 17 new rules tests (red/colour alternation, legal re-spots, all foul
  classes, colouring-up sequence to `FRAME_END`, tie-black re-spot + replay,
  respot collision fallback, deterministic no-contact= foul via real `applyStroke`).
  Shared suite now **25 tests green**; `pnpm typecheck` clean; E2E regression
  **62/62 passed**.
- Open finding (Parking Lot-worthy, CORRECTED in Day 12): corner pockets were suspected
  unreachable, but Day 12 probing showed they ARE reachable at dead-centre (ball centre
  captured at dist ~37.1 < corner pocket radius 48.25). Middle pockets behave the same.
  Matters for Day 13 natural-finish E2E.

---

### Day 12 · Bot skill levels (EASY/MEDIUM/HARD) (verified)
- Rewrote `server/src/bot/bot.ts`: physics-validated shot selection — every candidate
  pot, safety and break is checked with `simulateStroke` before a move is returned
  (MEDIUM/HARD); EASY plays blind with heavy aim/power error. Fully deterministic:
  per-shot RNG seed derives from level + match seed + turn + ballOn + colours +
  potted order + cue position.
- Skill separation measured as aggregate pot-rate over fixed seeds (see
  `server/src/bot/bot.test.ts`): **EASY 0.037 < MEDIUM 0.125 < HARD 0.150**.
  MEDIUM/HARD clear all reds (≈ stroke 123/125 and 76/84 respectively); EASY never
  does. MEDIUM fouls least (0.17–0.20 range across probes vs ~0.2+ others).
- Added **ball in hand in the D** (`FrameState.cueInHand`, optional `ShotInput.cuePos`),
  granted at frame start and after a potted-cue foul. The bot places the cue for legal
  breaks — with the cue pinned to D-centre there was NO legal break lane past the
  baulk-colour spine, which produced a 100% foul storm for every level.
- Two real engine bugs surfaced while chasing stats (both fixed in `shared`):
  1. `simulateStroke` clones internally (non-mutating) but `applyStroke` never wrote
     the result back into `frame.balls` — ball positions never advanced during play.
     Day-11 tests only asserted counts/flags, so they passed anyway; the Day-12 E2E
     bot check now exercises the real path.
  2. On a foul, `respotIds` includes potted reds and `applyResolution` added them to
     `colorsRemaining` — the colour set bloated to 17+ ids and frames could never end.
     Now only colour ids are re-added.
- Pot geometry now uses proper cut-aim lines (contact point one ball-diameter behind
  the target on the pocket side, power scaled by cut distance), replacing the old
  straight-only >=0.93 alignment filter — this is what made real pots possible.
- Tests: `server/src/bot/bot.test.ts` → pot-rate ordering, shot determinism, in-hand
  D placement + legal contact, red-phase clearance. (Note: the skill test is heavy,
  ~4.4 min — accepted for the bot gate.) Shared suite still 25/25; `pnpm typecheck`
  clean; E2E regression **62/62 passed**.

### Day 13 · Full-match E2E (no concedes) (verified)
- Goal met: the regression suite now plays a **full BO3 match to natural frame
  completion over the network** (two human seats driven by the deterministic HARD
  solver through `shot:play`), then asserts winner, frame progression and settlement.
- Root-caused + fixed the long-running "frames never finish" bug — it was a SHARED
  engine defect, not a bot weakness:
  - `simulateStroke` returned `pottedIds = balls.filter(potted)` — a CUMULATIVE
    set that included every ball potted in EARLIER strokes (the sim clones
    `frame.balls`, which carries the existing `potted` flags). Over a game,
    `remainingReds`, foul respots and colour accounting were poisoned by stale
    entries (e.g. `remainingReds` reached 0 while 14 reds still sat on the table).
    Now `pottedIds` is derived from the stroke's own `POTTED`/`CUE_POTTED` events.
    Verified: MEDIUM/HARD now finish real frames solo at strokes ~104–128 / ~125–130
    with realistic scores (104–115), up from "never".
- Second bug: `frame:start` always broadcast `frameIndex = match.frameIndex + 1`, but
  `match.frameIndex` was never incremented — frames 2 and 3 re-reported index 1.
  Now uses `newFrameForMatch` before broadcasting, so indices run 1, 2, 3 …
- Shared state now round-trips over the wire: `frameSnapshot` carries
  `phase / pottedOrder / colorsRemaining / cueInHand / winnerIndex` and new
  `frameFromSnapshot` rebuilds a `FrameState` — lets the harness drive
  `computeBotShot` from live server snapshots (and will power client remount).
- The over-strict `SCREEN_MARGIN` occlusion filter in `buildPotCandidates` was
  removed: colour pots now get validation-sim chances instead of being pre-culled.
- Bot-gate test hardened to the real goal: skilled levels must clear reds **and
  finish the frame**; dropped the flaky 2-seed `HARD > MEDIUM` pot-rate ordering
  (kept the robust `EASY < {MEDIUM, HARD}` separation). 3/3 green, ~137s.
- E2E is now section 11 ("natural finish: BO3 plays to frame end, no concedes"):
  scripts both seats with solver shots, verifies twin broadcasts, frame-end detection
  (via `FRAME_END` / `frame:start`), match decision at 2 frames, `PRIZE_SETTLED`,
  winner +80 net / loser −100, `resultJson.prize === 180`, and that frame indices
  actually advance. **72/72 checks passed.** Shared 25/25; `pnpm typecheck` clean.

### Day 14 · Lobby UX: tiered tables $1/$5/$10 (verified)
- Lobby now shows **tables by price** (R3): a tab bar with one tab per tier
  (`$1/100 CR`, `$5/500 CR`, `$10/1000 CR`) showing the live count of waiting tables
  in that tier; each tab lists waiting matches with host, format, stake, age
  (`2m ago`) and `1/2` waiting, plus a **Join** button.
- Tiers are loaded from **`GET /api/matches/tiers`** (not the shared constant) with a
  `STAKE_TIERS` fallback on failure; wallet chip still shows balance + locked.
- Create-match card upgraded from a `<select>` to visual tier chips (with CR price);
  this is what makes "create a match on any tier" a first-class action. Format still
  selectable (BO1/BO3/BO5).
- Empty states per tier ("No tables waiting at this price — create one above") and a
  manual **Refresh tables** button; a player's own waiting table is labelled "You ·
  waiting for opponent" instead of offering a self-join.
- Verified: `pnpm typecheck` clean, `vite build` green (48 modules), dev server serves
  the page (200) and HMR picks up the changes. Server-side create/join across tiers
  remains covered by the existing E2E (TIER_1) + shared constants.
- Fix while wiring the flow: on a **fresh** login/register the socket was connected
  but its event listeners were never attached (`handleSocketEvents` ran only on the
  session-restore path in `init()`), so a newly created/joined match rendered a dead
  game screen. Both login and register now attach the handlers immediately.

### Day 15 · Match UI/UX + realtime feel (verified)
- The game view now has the full "played over the network" lifecycle:
  - **Match strip HUD** (above the table): your name + YOUR TURN (green) / WAITING,
    centre meta line `Frame N · BOx · frames X-Y` (or `Practice`), opponent name;
    driven by a `updateHud()` that re-renders from state every update.
  - **Ball-on + reds readout** moves from the strip to the title bar (`RED`,
    `colour:N`, `${N} reds`) and the canvas HUD is now **seat-aware** (you/opponent
    scores swap correctly for seat 1).
  - **Live aim feedback**: power bar (fills as you drag) + spin readout (arrow keys)
    wired through `cueController.onChange`; the renderer draws a spin-aware aim line
    (end dot + perpendicular spin tick).
  - **Events → toasts**: `game:update` events now produce toasts — combined
    "Potted: red, black …", fouls `Foul: <reason> (-N)`, "Frame N won by <name>"
    (FRAME_END) — while `framesWon` tracks locally for the strip.
  - **Concede / Finish practice** with a confirm overlay (stake forfeit warning) via
    `socket.emit('concede')` or `POST /api/practice/resign`.
  - **Reconnect chip** in the header: socket `connect`/`disconnect` toggles
    online/reconnecting… and auto-rejoins (`match:join`) on reconnect.
  - **Match-end overlay**: `match:end` fetches `GET /api/matches/:id` (polls up to 6s)
    and shows winner name, final frames, and prize from `resultJson.prize` (or a
    "practice — no credits" note). `Back to lobby` restores state.
- Practice detection is explicit: `enterMatch(matchId, isPractice)` — create/join pass
  `false`, practice start passes `true`; the strip/buttons/toasts adapt accordingly.
- CSS added: `.match-strip`, `.name-you/.name-opp`, `.turn-name(.active)`, `.meta-line`,
  `.power-group/.power-meter/.power-fill`, `.spin-label`, `.chip-ok/.chip-bad`,
  `.overlay`, `.end-winner`, `.end-prize`.
- Verified: `pnpm --filter @snooker/client run typecheck` clean; `vite build` green
  (48 modules); dev server still serves 200; API 401s without auth as expected.

### Day 16 · Tournament drain E2E + hardening (verified)
- Goal met: the regression suite now **fills an 8-player tournament and drains every
  round to a champion** over the network, then asserts bracket, champion, runner-up,
  settlement and prize accounting are all exact.
- Three real backend gaps were found and fixed along the way:
  1. **Tournament matches never became playable in the DB.** `createTournamentMatch`
     created them `WAITING_FOR_PLAYER` and nothing ever flipped the status, so
     `settleMatch`'s playability guard (`MATCH_STARTED|MATCH_IN_PROGRESS`) threw
     "match not playable" and the bracket never advanced. Now, when a room actually
     starts (both seats seated in `match:join`), the match row is set to
     `MATCH_STARTED` with `startedAt`.
  2. **Socket.IO races settlement with the status update.** Handlers are dispatched
     concurrently, so a `concede` could reach `settleMatch` before the joining
     handler's `MATCH_STARTED` update had committed (read `WAITING_FOR_PLAYER`,
     threw). Added a **per-match lock** (`roomLocks` + `runExclusive`) so `match:join`
     and `concede` run serialized per `matchId` — joins (incl. the DB status write)
     always finish before a settle. This is the fix that made the drain green.
  3. **Elimination/status bookkeeping was wrong.** `markEliminated` was called with
     the *just-won* seed and treated it as the champion, so every interim winner was
     stamped `CHAMPION`; SF runners-up and the final runner-up stayed `ALIVE` forever.
     Now champion/eliminated is derived per bracket slot (a seed is eliminated the
     instant it loses any slot), the **final** champion gets `CHAMPION`, and the
     runner-up is captured from the final slot's seeds into `runnerUpId`.
- Settlement hardening: `settleMatch` now **short-circuits at zero stake** — free
  tournament matches (entry fee 0) never create noise ledger rows; they just mark
  `PRIZE_SETTLED` with `pool/fee/prize = 0`. `onMatchEnd` is wrapped in try/catch
  with structured error logging instead of letting rejections go unhandled.
- E2E is now section 12 ("tournament drain: 8 joins -> all rounds -> champion"): 8 fresh
  players each get 1000 CR, join an 8-player cup, the 9th join is rejected, every
  bracket match is drained in order via a one-sided socket concede (seat 0 wins →
  deterministic seeds), then asserts: tournament `COMPLETED`, `championId` = seed 1
  player, `runnerUpId` = seed 3 player, `finishedAt` set, bracket winners
  `QF [1,4,3,2] → SF [1,3] → F 1`, every slot carries a `matchId`, exactly 7 matches
  all `PRIZE_SETTLED` with the right `winnerId`, final `resultJson.prize=0`,
  seed 1 = `CHAMPION` and the other 7 = `ELIMINATED`, **all 8 wallets untouched at
  1000/0/1000** (free tournament), and `GET /api/tournaments/history` lists it.
  **116/116 checks passed.** Shared 25/25; typecheck clean across all packages.
- Note for Day 22: two tournament rounds finishing at the *same instant* could still
  race `commitTournamentResults` into creating a duplicate next-round match
  (resultsJson is read then written outside a row lock). Sequential settlement (the
  E2E path and the normal server loop) is safe; a defensive re-check + unique match
  guard can be added with the reconnect-work.

### Day 17 · Tournament UI: bracket, join, champion (verified)
- Goal met: players can create, recruit, watch, and play out an 8-player knockout
  entirely in the client, and finished cups end in a champion ceremony.
- Two small server route additions (`tournaments/routes.ts`):
  - `GET /api/tournaments/mine` — tournaments the caller is a player in, status
    `DRAFT|OPEN|IN_PROGRESS` (feeds the lobby "Your tournaments" section and the
    return-to-bracket flow).
  - `GET /api/tournaments/history` now includes the `CHAMPION` player so the lobby
    can show "… — winner: <name>" per completed cup.
- Client work (`main.ts` + `styles.css`):
  - **Tournament screen** (`renderTournament` + `bracketNode`, keyed by a new
    `activeTournamentId` state that `render()` routes on, mirroring `activeMatchId`):
    header card with name/status/format and `Refresh` + `Back to lobby`; a
    **seeded 8-player bracket** rendered from `resultsJson.rounds` as three
    height-halved columns (QF → SF → Final), each node showing both players by seed
    with the **winner bolded** and the loser struck through, a **"you" tag** on your
    own row, a **Play/Resume button on any of your playable matches** (walks straight
    into the match UI and back), and a players list with seed + `ALIVE/ELIMINATED/
    CHAMPION` badges. Non-final rounds left empty show `TBD`; the whole bracket
    auto-refreshes every 2.5 s while recruiting/in-progress so entrants and results
    appear live (timer is cancelled on match entry / navigation).
  - **Champion ceremony**: completed cups show a gold `CHAMPION` + name + runner-up
    banner (with "This is you" when the viewer is the winner).
  - **Lobby card rewrite**: `Create Tournament` now creates **and immediately joins**
    you as seed 1 (then jumps to the bracket), and the card adds three list sections —
    Open tournaments (join buttons, "joined" badge), Your tournaments (Bracket
    buttons), and Past tournaments (winner + Bracket view).
  - **Return navigation**: the match-end overlay button reads
    "Back to tournament" when a cup is active, and `leaveToLobby`/logout properly
    cancel the bracket refresh timer; entering a match always cancels it too.
- Verified: client typecheck + `vite build` green; full server E2E still
  **116/116** (tournament routes untouched by the UI work). Headless-browser proof:
  logged in as a seeded player, the lobby shows the tournament lists, the
  in-progress bracket renders 7 nodes / 3 rounds with exactly one **Play** button on
  my QF match (node shows "you"), and the finished cup shows the champion banner
  with 7 winners + 7 losers marked in the bracket. Screens saved (dev-log):
  `Temp/opencode/tour-lobby.png`, `tour-live.png`, `tour-done.png`.

### Day 17b · Fully 3D table renderer (verified)
- Goal met: the play view is now a **fully 3D table** (Three.js / WebGL), per the
  client's "it's 2D, we want fully 3D" feedback. Physics, socket flow, rules, and
  the mouse aim/power interaction are unchanged; only the presentation layer moved
  to a real-time 3D scene, with the old 2D canvas as an automatic fallback.
- `packages/client/src/game/scene3d.ts` (`Scene3D` class):
  - WebGL renderer on the existing 1200×640 canvas, ACES filmic tone mapping,
    PCF soft shadow maps, hemisphere + key/fill directional lights.
  - Perspective camera (`fov 50`, pos `(0, 1400, 1750)`, looking at the table
    centre) giving a top-down snooker view with depth; table coordinates mapped to
    the scene as `x - 3569/2` / `z = y - 1778/2` (mm, origin at the centre).
  - Canvas-textured felt: green cloth with weave grain, centre-light vignette,
    **baulk line, D-arc and all six spots**; wooden apron + 4 legs; green cushion
    segments with **pocket gaps at all 6 holes** (4 corners + 2 middle); dark pocket
    discs + dropped-hole cylinders; dark floor plane.
  - All 22 balls as shaded spheres with per-ball materials, expansion-blob contact
    shadows + real shadow casting; potted balls are hidden.
  - Aim visuals while it's your turn: dashed aim line, aim-point dot, optional spin
    arrow, and a segmented **cue stick** aligned to the aim with its tip just
    behind the cue ball.
  - `Scene3D.create` returns `null` when WebGL is unavailable, in which case
    `main.ts` keeps using the existing 2D `drawTable`.
- `main.ts` integration: the scene is created/disposed together with the game
  canvas (`renderGame`/`leaveGameState`) and updated + rendered inside the existing
  `rAF loop`. `renderer.ts` gained `setTableTransform` so the 3D camera's screen
  projection feeds the mouse aim (cue/target position and drag power) — without it,
  `tableToCanvas` stayed at the default `(0,0,0)` and aiming targeted the canvas
  origin with power clamped to minimum.
- Verified: client typecheck + `vite build` green. Headless Chrome
  (`--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader`) in a
  practice match confirms WebGL is active, the felt renders richly lit (pixel
  probes `rgb(8..16, 142..152, 83..89)` at table centre; ~25% of the frame is green
  cloth vs 43% dark surround, balls/reds visible), the aim-power drag reaches 99%,
  and the page logs **zero console/WebGL errors**. Screens saved (dev-log):
  `Temp/opencode/game-3d.png` (idle break layout) and `game-3d-aim.png`
  (power ~99%, cue aimed).

### Day 25 · Renderer polish + game feel (3D) (verified)
- Goal met: the 3D build-out from Day 17b now feels alive — balls glide to their
  physics positions instead of stepping, the cue visibly pulls back with power, and
  the arena reads as a real room (hanging lamp, warm spot, room wall, cushion
  rubber trim).
- `packages/client/src/game/scene3d.ts`:
  - **Ball interpolation**: each `BallRig` carries a `target`; every render frame
    the visible balls lerp toward it with an exponential factor
    (`1 - exp(-dt * 14)`, dt capped at 50 ms). First appearance and teleports
    (>500 mm from current position, e.g. pot re-spots) snap instantly via a
    `firstSeen` flag. This removes visual stepping between server snapshots while
    the physics stays authoritative.
  - **Cue pull-back**: the stick's tip gap grows with power
    (`BALL_RADIUS + 10 + power * 240` mm), so pulling power back visibly draws the
    cue away from the cue ball — classic snooker-game feel.
  - **Arena pass** (`buildTable`): a lighter green **cushion-nose band** runs along
    the inner edge of every cushion segment (gap-aware so pockets stay open); a
    **brass lamp shade + glowing bulb** hangs over the table centre with a warm
    **SpotLight** washing the felt; a large dark **back wall** closes the room
    behind the table.
- Verified: client typecheck + `vite build` green; headless Chrome practice match —
  WebGL active, felt probes unchanged-bright (`rgb(~8..16, 142..152, 83..89)`),
  aim-power drag reaches 99%, and firing a 99%-power break shot registers in the
  3D scene (snapshot diff ~0.96% of pixels across the table bbox in flight, then
  settled; practice bot resolves its reply instantly). Screens saved (dev-log):
  `Temp/opencode/game-3d-aim.png`, `game-3d-move1..8.png`.

### Day 18 · Profile, stats, leaderboards (verified)
- Goal met: each player has a real, meaningful record — a profile/stats summary, a
  period-filtered leaderboard, and a match history that shows results — with the
  hard rule **practice games never count toward any stat**.
- Server (`users/stats.ts` + `users/routes.ts`, mounted in `app.ts`):
  - **`GET /api/me`** → `{ user (id, username, createdAt, profile, wallet.balance),
    stats: { matches, wins, losses, winRate, highestBreak } }`. Matches = non-practice
    finished matches (`status in PRIZE_SETTLED/MATCH_COMPLETED/RESULT_VERIFIED`) the
    user is a player in; wins from `MatchPlayer.result = 'WIN'`; `winRate` = one decimal.
  - **`GET /api/leaderboard?period=all|week|month`** → top 20 ranked by wins, then
    win rate, then matches, each with `{ rank, username, matches, wins, losses,
    winRate, highestBreak }`, plus a `me` entry (your rank, even when outside the top 20)
    so the UI can highlight you anywhere on the board.
  - **Highest break is computed from the persisted `GameEvent` stream**, not guesses:
    `bestBreakForEvents` walks a match's `BALL_POTTED`/`FOUL`/`TURN_CHANGE` events in
    `seq` order, accumulating potted points (reds = 1, colours 16–21 = 2–7) per visit
    and closing the visit at a foul/turn-change/frame-end/stream-end. To make frame
    boundaries exact, `game/room.ts` now **persists the `FRAME_END` event** it already
    broadcast (it was only live before), so a break that ends a frame (e.g. a century
    on the final black) is still counted.
- Client (`main.ts` + `styles.css`):
  - **Profile & leaderboard card** in the lobby: five stat tiles (Matches / Wins /
    Losses / Win rate / Highest break) from `/api/me`, a leaderboard with a period
    `<select>` (All time / Last 30 days / Last 7 days) that re-fetches on change, a
    top-20 table (`#`, Player, W-L, Win rate, High break), and a highlighted "you"
    row (also appended below the cut if you're outside the top 20).
  - **History card upgraded** to show Result (W/L badge) and Opponent per match,
    alongside the existing id/format/when columns.
- Verified: server + client typecheck clean; `vite build` green; shared 25/25 and
  server 3/3 unit tests; **full server E2E regression 116/116** (routes + `FRAME_END`
  persist change safe). Break math validated against real stored events
  (`e2eb1130_wjdfm6` → highestBreak 18, loser → 8, 13, …). Headless-browser proof:
  logged in as `e2eb1130_wjdfm6`, the lobby renders tiles **3 / 2 / 1 / 66.7% /
  18**, the leaderboard lists the top 20 with the user's "you" row at #7 with break
  18, the W/L history shows 2 wins + 1 loss vs `e2ea1130_wjdfm6`, and switching the
  period re-renders the board. Screens saved (dev-log): `Temp/opencode/lobby-stats.png`,
  `lobby-stats-week.png` (only browser error = auto `/favicon.ico` 404, no favicon
  shipped; benign). Note: `e2eb1130_wjdfm6@e2e.test`'s password was set to
  `password123` for the demo login.

---

## 7. Upcoming Phases (day by day)

Each phase: **Goal** · **Tasks** · **Done when** · **Notes**.

### Day 11 — Rules engine audit + full-frame fix
- Goal: prove a snooker frame plays start → end correctly (reds → colours →
  re-spot black) and the match terminates with a fair winner.
- Tasks:
  - Audit `packages/shared/src/rules/snooker.ts` + `frame.ts` state machine,
    including the frame "phase" transitions (e.g. colour-up flagging).
  - Verify endgame: path to final colour sequence, tie-break black re-spot.
  - Verify foul handling: value-of-ball-on, cue potted, no contact, off table.
  - Add deterministic unit tests for these scenarios.
- Done when: a full simulated frame completes without concession; tests prove
  red/colour alternation, fouls, and tie-black logic; no known gap remains.
- Notes: existing game-flow E2E used concession; this phase makes frames
  playable to a natural end.

### Day 12 — Bot skill levels (EASY/MEDIUM/HARD)
- Goal: distinct, believable, testable robot behavior per level.
- Tasks: tune aim error / power error / shot selection / safety per level;
  extend bot tests; ensure skill is seeded (deterministic).
- Done when: EASY < MEDIUM < HARD in an automated potting-stat comparison;
  bot still never touches the wallet and uses the human shot path.
- Notes: also validates Day 11 rules — the bot must be able to finish frames.

### Day 13 — Full-match E2E (no concedes)
- Goal: a scripted human vs human and human vs bot match that goes to
  frame completion (no concede) and settles correctly.
- Tasks: drive real shots from the E2E harness; assert rules progression,
  frame end, match end, settlement; fix any engine/server issues found.
- Done when: the regression suite includes a natural-finish match, and wallets +
  match status end correct after settlement.

### Day 14 — Lobby UX: tiered tables
- Goal: the lobby clearly shows "many tables according to price" (R3).
- Tasks: tier tabs/filters ($1 / $5 / $10), waiting players shown per table tier,
  join button, wallet/balance chip, empty states.
- Done when: a user can see all three tiers, create a match on any, and join one;
  client uses `GET /api/matches/tiers`.

### Day 15 — Match UI/UX + realtime feel
- Goal: playing feels like playing.
- Tasks: aim line + power bar + spin indicator polish, turn/scores/frames HUD,
  pot/foul/break toasts, concede with confirm dialog, disconnect banner,
  match-end screen with payout.
- Done when: the full lifecycle is usable without the console.

### Day 16 — Tournament drain E2E + hardening
- Goal: prove an 8-player tournament plays out and settles completely.
- Tasks: script 8 user joins → drain all rounds via real shots or automate
  one-sided concedes per round rules → verify bracket, champion, resultsJson,
  settlement correctness; fix issues.
- Done when: a full tournament finishes in the regression suite and prize
  accounting is exact.

### Day 17 — Tournament UI
- Goal: user-facing tournament experience.
- Tasks: tournament list/join screen, bracket view (seeded), link to live matches,
  champion ceremony screen.
- Done when: create → 8 join → brackets visible → matches playable → champion shown.

### Day 18 — Profile, stats, leaderboards
- Goal: meaningful player record.
- Tasks: `GET /api/me`, stats endpoint (matches, wins, winrate, highest break),
  leaderboard (period filter); profile page; **practice excluded from stats**.
- Done when: stats pages render real numbers and practice games never count.

### Day 19 — Notifications
- Goal: surface events without polling.
- Tasks: notification model + stream; match invite/result notifications; in-app
  banner/toast list; unread badge.
- Done when: a user sees a notification for match results and practice reminders,
  wired through server events.
- Session record:
  - Prisma: `Notification { id, userId, kind, title, body, read, createdAt }`
    (already in schema) enhanced with `@@index([userId, read])` +
    `@@index([userId, createdAt])`; migration `20260925175453_notifications`
    applied; client regenerated (v6.19.3; had to stop dev servers to unlock DLL).
  - `packages/server/src/notifications/`: `service.ts` (`notify()`, writes row +
    optional pusher; `setNotificationPusher()`) and `routes.ts`
    (`GET /api/notifications` → `{ items, unread }`, `POST /api/notifications/read`
    `{ ids? }` empty = mark all). Mounted in `app.ts`.
  - Wiring: `matches/service.ts` notifies seat-0 owner on `joinOneVsOneMatch`
    (MATCH_INVITE) and both players after `settleMatch` (MATCH_RESULT, incl. prize
    CR when stake > 0, reason text); `tournaments/service.ts` notifies on champion
    (`advanceTournamentAfterMatch`); `game/index.ts` practice branch notifies the
    human after onMatchEnd (PRACTICE, mentions remaining free practice when
    balance is zero), joins each socket to `user:<id>` room, and registered pusher
    → `io.to(user:<id>).emit('notification:new', n)`.
  - Client: header bell (inline SVG) + unread badge, popover panel with
    timeAgo titles/bodies, mark-one-read on click, Mark all read, live
    `notification:new` handler → toast + badge bump + prepend; fetches notifs
    after login/init; CSS `.bell/.bell-badge/.notif-panel/.notif-item`. Vite build
    green (609 KB chunk, pre-existing warning).
  - Verification: server + client typecheck clean; shared 25/25, server 3/3;
    E2E 116 → **125/125** (added section 13: join invite, settle result for both,
    champion crown, practice completion via socket play, unread count, mark-all);
    headless Chrome demo: live badge 1→2→3 (join, settle, practice), panel lists
    `"player2 joined your match"` / `"You won 180 CR"` / `"Practice complete"`,
    mark-all clears badge; screenshots in Temp/opencode (`notif-badge.png`,
    `notif-panel.png`, `notif-panel-practice.png`, `notif-panel-marked.png`).
    Only console error is the pre-existing favicon 404.

### Day 20 — Admin panel UI
- Goal: admin can run the platform from the browser.
- Tasks: SUPERADMIN login gate; dashboard stats; users list + status patch +
  wallet adjust (audited); matches list + replay viewer; settings editor;
  admin action log view.
- Done when: every admin server route has a UI and writes an `AdminAction` row.
- Session record:
  - Server: added `GET /api/admin/actions` (audit feed, newest 200 desc,
    `adminUsername` resolved from `User` id→username map, no relation on model).
    Other admin routes (stats/users/patch/wallet-adjust/matches/matches/:id/events/
    settings/patch/fraud) already existed, all gated by
    `requireRole(['ADMIN','SUPERADMIN'])`.
  - Client: `currentUser` extended with `role`/`status` (login/register/status
    response types); new header "Admin" button shown only for ADMIN/SUPERADMIN
    (toggles `adminOpen`, clears active match/tournament, re-renders); `render()`
    branch routes to the admin panel.
  - `packages/client/src/admin.ts` (new, self-contained): 5-tab panel
    (dashboard/users/matches/settings/audit) with module-level `currentTab`,
    local `el()` helper. Dashboard = 6 stat cards. Users = table with per-row
    role + status `<select>` (PATCH on change, toast + refresh) and audited
    wallet adjust (amount + required reason → `/api/admin/wallet/adjust`).
    Matches = table (players/format/stake/status/winner) → click row for detail:
    meta card + capped game-event list (`/api/admin/matches/:id/events`, head+tail
    with a "more" note) + Back. Settings = per-key JSON input editor with Save
    (validates JSON, PATCH), plus Add setting row. Audit = action table
    (time/admin/action/target/meta, meta truncated). Fixed a stacking bug:
    `renderAdminPanel` now removes any prior `.admin` node before appending,
    so tab switches replace content instead of piling up panels.
  - CSS: `.admin/.admin-nav/.admin-tab(.active)/.admin-cards/.admin-card/
    .admin-table/.admin-adjust/.admin-key/.admin-add-setting/.admin-events/
    .admin-event/.admin-event-seq/.admin-match-meta/.admin-meta-*/.clickable`.
  - Verification: server + client typecheck clean, `vite build` green; shared
    25/25, server 3/3; E2E 125 → **140/140** (section 14: admin login, alice 403
    on admin stats, users list, PATCH BANNED persisted, restore + promote,
    wallet adjust +25 reflected in wallet, matches list, replay events non-empty
    — probes first settled match with events since tournament drain matches
    concede-instant and carry zero events, settings PATCH visible, actions log
    contains SET_SETTING/WALLET_ADJUST/UPDATE_USER). Headless Chrome demo as
    admin: dashboard cards + all 5 tabs rendered, match replay shows event
    stream, audit shows audited rows with admin username; regular
    `player@snooker.test` sees no Admin button/panel; screenshots in
    Temp/opencode (`admin-dashboard.png`, `admin-users.png`,
    `admin-match-replay.png`, `admin-settings.png`, `admin-audit.png`,
    `admin-gated-player.png`). Console noise only favicon 404 + one benign 401
    from the gating tab's storage clear.

### Day 21 — DB-backed settings + maintenance mode
- Goal: settings changeable without redeploy.
- Tasks: config table migration + loader; settings API wiring
  (commission, min/max stake, formats, turn timeout, reconnect grace);
  maintenance-mode gate enforced on auth/game.
- Done when: changing a setting via admin reflects immediately and maintenance
  mode blocks player requests.
- Session record:
  - Settings module `packages/server/src/settings/index.ts`: `GameSettings`
    typed snapshot (commissionPct, minStake, maxStake, matchFormats,
    turnTimeoutSec, reconnectGraceSec, maintenanceMode, realMoneyEnabled),
    DB-backed via `AppSetting` with 2s TTL cache + `invalidateSettingsCache()`
    on admin PATCH (so changes reflect immediately), `ensureSeedSettings()`
    upserts rows missing at boot from env-config defaults, `isMaintenance()`.
  - Wiring: `validateStake`/`resolveStakeTier` are async and read
    min/maxStake live; `createOneVsOneMatch` stores `platformFeePct` from the
    live commission setting; new `assertViableFormat()` gates formats on
    `matchFormats` (used by both 1v1 create and practice create). Removed dead
    `isMaintenanceOn`/`maintenanceAllowed` scaffolding.
  - Maintenance gate: global `onRequest` hook in `app.ts` replies 503
    `maintenance in progress` for every path except `/api/admin/*`, `/api/health`,
    `/api/settings/public`, `/api/auth/login`; login handler allows only
    ADMIN/SUPERADMIN during maintenance (so an admin can still log in and turn
    it off); socket.io `io.use` rejects connections with `maintenance` error;
    new public `GET /api/settings/public` → `{ maintenanceMode }`.
  - Client: `refreshMaintenance()` polls `/api/settings/public` every 10s;
    players get a full-screen `.maintenance-overlay`, admins get a top
    `.maintenance-banner` (so they can still reach the panel). Admin settings
    tab gained a "Maintenance mode" card with an ON/OFF toggle.
  - Verification: server + client typecheck clean, `vite build` green; shared
    25/25, server 3/3; E2E 140 → **169/169** (section 15: seeded settings
    present; minStake 150 rejects TIER_1; maxStake 500 rejects TIER_10;
    commission 0.2 reflected on a freshly created match's `platformFeePct`
    (join+concede cleanup); matchFormats [BO1,BO3] rejects BO5; maintenance on
    blocks player login + practice + socket connect, admin routes + admin login
    still work, `api/settings/public` reflects true then false after
    re-enable; section idempotent via a settings reset preamble). Headless
    Chrome demo: admin flips maintenance via settings toggle → admin banner;
    fresh player tab shows the overlay and login is 503-blocked; flipping off
    clears both and the player logs back in. Screenshots in Temp/opencode
    (`maint-admin-banner.png`, `maint-player-overlay.png`,
    `maint-player-restored.png`). Console noise only favicon 404 + the two
    503s that ARE the block working.

### Day 22 — Reconnect & disconnect policy
- Goal: match survives brief disconnects.
- Tasks: room marks player disconnected, grace timer,
  reconnect replays missed events by `seq`, timed-out abandon → refund/settle policy.
- Done when: a disconnect/reconnect test passes in E2E and abandoned matches settle per policy.
- Done. Implementation:
  - `room.ts` tracks a socket-set per seat; `registerSocket` clears seat disconnection and
    broadcasts `opponent:reconnected { seat }`, `unregisterSocket` marks the seat disconnected
    (when its last socket leaves) and broadcasts `opponent:disconnected { seat }`. `noteDelivered`
    advances a per-user `deliveredSeq` only for seats with live sockets so a parted player's
    watermark freezes where they left off.
  - `game/index.ts` adds a per-match grace timer (`reconnectGraceSec` setting, default 120,
    min 1) started only when the match has started and a seat's sockets empty. On expiry:
    practice → `MATCH_COMPLETED`; one seat gone → opponent wins (settle `reason: 'abandon'`);
    both gone → settle to frames leader, else `refundMatch` (`abandon_double_disconnect`).
    Rooms are disposed and timers cleared on resolution, and `onMatchEnd` now disposes rooms.
  - `match:join` rejoin path re-registers the seat, clears the timer when both seats are back,
    and replays `GameEvent` rows with `seq` after the player's watermark via `match:replay`.
    Joining an already-settled match returns `match:end` (reason from result) instead of
    recreating a stale room.
  - Client shows an in-game "Opponent disconnected — waiting for them to return" banner
    (`opp-holder`), clears it on `opponent:reconnected`, and toasts `match:replay` summaries.
  - E2E §16: reconnect-within-grace replays missed turns and never settles; expiry →
    opponent wins (`-100/+80`); double-disconnect → refund (0 delta). **193/193 checks.**
  - Headless demo (`Temp/opencode/reconnect-demo.ts`, single Chrome tab + socket.io opponent
    from the script): join a match, opponent drops → banner appears (`rc-2-banner-shown.png`),
    opponent returns → banner clears and the player is still in the match
    (`rc-3-banner-cleared.png`). Earlier dual-Chrome demo risked hanging the laptop and was
    replaced by this one-tab approach per user request.

### Day 23 — Turn timers, rate limits, input hardening
- Goal: server-side discipline (anti-cheat 1–4).
- Tasks: enforce turn timeout → auto foul / forfeit; per-socket rate limits;
  shot input schema + anomaly checks; timing checks.
- Done when: an E2E test proves a timeout costs the right penalty and
  flood/skewed inputs are rejected.
- Done. Implementation:
  - `shared/rules/snooker.ts` adds `applyTimeoutFoul(frame, shooterIndex, reason)`:
    awards `max(4, ball-on value)`, switches the visit, resets break score, keeps the
    table untouched (no stroke). Unit-tested in `frame.test.ts` (red 4 / colouring-up 7 /
    table untouched).
  - `room.ts` owns a `turnTimer` armed at join, start, each committed shot, and each
    new frame (guarded: only when started, not stopped, mid-frame, human, connected,
    `turnTimeoutSec > 0`). On fire, `onTurnTimeout` applies the timeout foul and emits
    `FOUL { penalty, reason: 'turn timeout', bySeat }` + `TURN_CHANGE`, then re-arms.
    `commit()` (shared by `executeShot` and `onTurnTimeout`) broadcasts or ends the frame.
    `turnTimeoutSec` is read from settings when a room is created (default 60).
  - New `game/throttle.ts` `ShotEnforcement` gate in `shot:play`:
    per-socket + per-user token buckets (20/15s and 40/30s), `validate()` schema
    (finite aimAngle, power ∈ [0,1], spin |x|,|y| ≤ 1.5, cuePos finite, timestamp drift
    ≤ 15s — `timestamp: 0` is the AI-stack "no client clock" marker and is tolerated),
    and a duplicate-shot replay check keyed by socket in a 3 s window (fingerprint
    excludes timestamp). Error codes: `rate_limited`, `bad_input`, `bad_aim_angle`,
    `bad_power`, `bad_spin`, `bad_timestamp`, `bad_cue_pos`, `duplicate_shot`.
  - Client sends `timestamp: Date.now()` with every shot.
  - E2E §17: turn-timeout match (`turnTimeoutSec: 2`) broadcasts a 4-point penalty foul
    to the shooter and switches the visit; a hardened match proves future-timestamp,
    over-power, malformed spin, and malformed cue pos are all rejected, an identical
    re-input is `duplicate_shot`, a 120-shot flood yields ≥80 `rate_limited`, and a valid
    shot lands after a 2 s backoff. **212/212 checks.**
  - Tuning notes: limits were doubled-and-more from (6,3)/(12,6) because the
    bot-driven sim loops (§11 natural finish, §13 practice drain) legitimately fire
    ~3/s/socket; the flood test was scaled to 120 to stay meaningful. Wait timeouts in
    the bot loops were raised (break shots cost ~5 s under `computeBotShot('HARD')`) and
    the reconnect rejoin now retries `match:join` to ride out the server-side
    handler-registration race.

### Day 24 — Audit: replay viewer, fraud flags, ledger invariants
- Goal: trust and transparency — an admin can see why a result happened and audit the books.
- Fraud detection (`server/src/fraud/index.ts`): per-user 60 s sliding window, per-code
  thresholds with confidence scores — `duplicate_shot` -> 3 → `SHOT_REPLAY` (80%),
  `bad_timestamp` -> 3 → `CLOCK_SKEW` (40%), `rate_limited` -> 8 → `SHOT_FLOOD` (90%),
  `malformed` -> 5 → `MALFORMED_INPUT` (35%). Hooked at the `shot:play` boundary; bot shots
  skipped; 10-minute dedupe per (user, code) and every write failure swallowed so fraud
  signals never break gameplay.
- Ledger invariants (`checkLedgerInvariance`): every wallet must satisfy
  `available + locked == sum((balanceAfter - balanceBefore) + (lockedAfter - lockedBefore))`
  across its transaction history. Exposed at `GET /admin/ledger/invariance`; `ledger.test.ts`
  covers full lifecycle, double-settle idempotency, and adversarial settle.
- Admin UI (`admin.ts` + `adminReplay.ts`): new **fraud** tab with the invariant audit card
  and the flags table; match detail now embeds a canvas **replay viewer** rebuilt from
  persisted `GameEvent` rows (`SHOT`, `BALL_POTTED`, `FOUL`, `TURN_CHANGE`, `FRAME_END`),
  with |< Play < > >| controls, a step slider, and seq-highlighted event list.
- `GameEvent` persistence now records a `SHOT` row per stroke (`{ byIndex, shot }`)
  so non-live matches render; live `game:update` broadcast streams stay delta-only, so
  reconnects/replays are a pure superset and no e2e/seq assumptions changed.
- Verification: server vitest 6/6; server + client typecheck clean; client vite build clean;
  full e2e **228 passed, 0 failed** (incl. `== 18. audit: fraud flags, ledger invariance,
  replay data` — flags recorded with confidence, non-admin access denied, replay events
  replayed from db with strictly increasing seq, ledger invariant green after the audit);
  headless-Chrome screenshots of the fraud tab and replay viewer captured. One root-caused
  fix: e2e §8 was zero/restoring `alice`'s wallet with raw Prisma writes, desyncing her
  ledger by exactly 200 — switched to ledger debit/credit rows and repaired the three
  polluted wallets in dev data (429 ✅ 0 violations).

### Day 25 — Renderer polish + game feel
- Goal: looks like product, not prototype.
- Tasks: wooden frame + cloth gradients, ball gloss, pocket holes, cushion rails,
  aim line styling, pot animations, audio hooks, responsive layout, mobile-safe touch aim.
- Done when: a non-technical reviewer finds the table attractive and playable.
- Implemented (all in `packages/client`):
  - **Ball gloss** — switched ball rigs from `MeshStandardMaterial` to `MeshPhysicalMaterial`
    (`clearcoat 0.7`, low roughness); added a generated equirect gradient environment map via
    `PMREMGenerator` (`scene.environment`) so balls pick up studio reflections.
  - **Wooden frame** — apron + legs now use a generated wood-grain `CanvasTexture`; added
    brass trim bands along the apron rim, brass corner plates, and brass pocket rims
    (gold torus around each hole mouth).
  - **Cloth gradients** — felt texture gained a corner vignette pass (soft AO toward the
    rails) on top of the existing radial light falloff; marks/baulk/D preserved.
  - **Cushion/pocket detail** — cushion nose strip + pocket holes kept; rim geometry added
    around every pocket mouth.
  - **Aim line styling** — dashed target ray is now power-tinted (opacity 0.4 → 0.9), the
    aim dot gained an additive radial glow sprite that scales with power; same treatment in
    the 2D fallback renderer (`renderer.ts`).
  - **Pot animations** — when a ball transitions to potted in the 3D scene it now plays a
    ~300ms sink animation (eased drop toward its nearest pocket + shrink) before hiding,
    instead of vanishing instantly; the lerp loop skips sinking rigs so the fall is smooth.
  - **Audio hooks** — new `game/audio.ts` WebAudio synth (no asset files): pot = triangle
    plinks + low thud, foul = falling saw blips, frame end = rising triad, match end =
    arpeggio, cushion tick on pot batches. Context is created/resumed on first user gesture;
    a `Sound: on/off` toggle in the controls bar wires `setSoundMuted`. Fired from
    `handleGameUpdate` events (`BALL_POTTED` → `playPot(batch)` + tick, `FOUL`, `FRAME_END`)
    and on `match:end`.
  - **Responsive layout** — canvas sizing is now DPR-aware and driven by a `ResizeObserver`
    (`applyCanvasSize` + `Scene3D.resize`); `.table-frame` uses `max-width` + `aspect-ratio`
    and stacks the controls bar on ≤640px.
  - **Mobile-safe touch aim** — `input.ts` converted from mouse-only to Pointer Events
    (`pointerdown`/`move`/`up` with pointer capture and `touch-action: none`), so touch
    drag-to-aim and release-to-shoot work identically to mouse.
- Verification: client `tsc --noEmit` clean; client `vite build` clean (pre-existing >500 kB
  chunk warning only); server untouched; full e2e **228 passed, 0 failed**; server vitest 6/6.
  Headless-Chrome CDP capture in practice play: canvas internal size now responsive (1100×586
  at dpr 1 vs the old fixed 1200×640), `Sound` button present, real pot detected in-play
  (`Potted: red` toast), and pixel analysis against the pre-polish frames shows a 20.71%
  whole-frame change (wood/brass/gloss/vignette) plus a localized 0.23% brightened region
  along the aim ray (line tint + glow). Pot mid-sink frames proved unreachable headlessly
  (sink ≈ 300 ms vs ~300 ms screenshot latency under swiftshader), so the sink path is verified
  by code + build + stable rendering across shots (no JS exceptions logged over many captures).

### Day 26 — Client interp, resilience, perf (verified)
- Goal: smooth play on modest hardware.
- Snapshot interpolation: the server only broadcasts settled snapshots on shot commit /
  frame end (room cadence), so 3D already interpolates via the ball-rig lerp. The 2D
  fallback renderer teleported every ball; `renderer.ts` now caches each ball's last
  screen position and eases between snapshots with `1 - exp(-dt * 14)` (frame-independent
  smoothing, potted balls removed from the tracker), and the aim ray starts from the
  interpolated cue-ball position.
- Engine perf pass (`packages/shared/src/physics/world.ts`, allocation-free hot path):
  the pair loop inlines the old `resolveBallBall` as `resolveCollisionPair` (in-place
  velocity/position mutation, identical math: same overlap overlap resolution, impulse
  with `BALL_RESTITUTION`), `integrate()` is scalar/in-place, and `checkPockets()` uses
  squared distances with no temp vectors. Sim tick order and arithmetic unchanged, so
  the seeded/deterministic sim output is preserved (full e2e still 228/0 below).
- Client perf: `scene3d.ts` stopped disposing + rebuilding the aim/spin line geometries
  on every aim update — a `setLine()` helper rewrites the shared 2-point `position`
  buffer in place. All procedural textures (`felt`, `contact shadow`, `glow`, `wood`,
  `env`) are memoized in a module-level `textureCache` and no longer recreated or
  disposed per match (`shadowTex` field removed; materials/geometries still dispose).
  The render loop now tracks a frame-time EMA; sustained >28 ms frames step DPR down
  (2 → 1.5 → 1, with a toast), sustained <14 ms and 20 s quiet recovers DPR.
- Error resilience: the render loop is wrapped so a `scene3d.render()`/`drawTable()`
  throw disposes the 3D scene, falls back to the canvas renderer once, and surfaces the
  message; global `error` + `unhandledrejection` handlers feed a fixed bottom-left
  `#err-chip` (`aria-live="polite"`, auto-clears after 8 s). A `#net-overlay` sits inside
  `.table-frame` (now `position:relative`) and shows when a live match is socket-
  disconnected or offline, driven from socket connect/disconnect + window online/offline.
- Load basics: `vite.config.ts` adds `manualChunks` splitting `three` and
  `socket.io-client` into cached chunks, and the admin panel is now loaded via dynamic
  `import('./admin.js')` on first click (`mountAdminPanel`, gated on admin still being
  open + logged in). Build shows `three-*` 530 kB, `socketio-*` 42 kB, `admin-*` 22 kB
  (lazy), `index-*` 55 kB.
- A11y basics: toast announcements go through a hidden aria-live region (`#toast-live`,
  `aria-live="polite"` `aria-atomic="false"` span per toast, auto-removed); the game
  canvas is `role="img"` with a descriptive `aria-label`; `#hud-turn` is
  `role="status"` + `aria-live="polite"`; `#conn-chip` is `role="status"`.
- Verification:
  - shared: `tsc --noEmit` clean, vitest 2 files 28 passed (world determinism + frame
    rules) after the inlined-collision rewrite.
  - client: `tsc --noEmit` clean; `vite build` clean with the new chunk split (admin.js
    proves the lazy route).
  - server: `tsc --noEmit` clean; vitest 2 files 6 passed.
  - full e2e: **228 passed, 0 failed** (`e2e-day26.log`) against the rewritten engine —
    confirms match-level determinism was preserved.
  - headless Chrome CDP probe (`probe-day26.ts`): canvas `role=img` + aria-label present,
    canvas 1100×586 (dpr 1) matching frame width, `.table-frame` is `position:relative`,
    `#net-overlay` present and hidden (`display:none`) with correct copy, `#err-chip`
    present and empty, `#toast-live` polite/atomic-false, `#hud-turn` status+polite,
    `#conn-chip` role=status, Sound button still present, and **0 page exceptions**
    (`game-26-table.png` captured). rAF-cadence/fps could not be measured headlessly
    (new-headless delivers no BeginFrames, so `requestAnimationFrame` stalls — same
    limitation as Day 25; adaptive-DPR logic verified by code + basic metrics only).
- Notes: server untouched this day; `connected`/`updateConnChip` still drive the
  existing top-bar chip. Servers healthy (4000 + 5173) at wrap.

### Day 27 — Production readiness (ops groundwork, no real deploy) (verified)
- Goal: a fresh machine can boot the platform from docs alone and the runbook is
  committed.
- Env templates + fail-fast: `config.ts` now declares `DATABASE_URL`, `JWT_SECRET` and
  `COOKIE_SECRET` as **required** (secrets >=16 chars) and `LOG_LEVEL` as a pino-enum
  default `info`; the server and seed script refuse to boot without them (verified: a
  launch from repo root without `packages/server/.env` aborts with a clear zod error).
  Rewrote `.env.example` without inline comments (dotenv treats them as part of the
  value — the old example would have parsed `MIN_STAKE`/`MAX_STAKE` as NaN), documented
  every var, and added the `LOG_LEVEL` + secrets guidance. `development_plan.md` §15 and
  README corrected: `CORS_ORIGIN` -> `CLIENT_ORIGIN`, plus `PORT`/`LOG_LEVEL`.
- Migration order step: added `db:deploy` (`prisma migrate deploy` — non-interactive,
  safe to repeat), `db:status`, `db:generate` to the server package, wired `prisma db
  seed` via the `"prisma": {"seed": ...}` block, and mirrored `db:deploy`/`db:status`/
  `db:backup`/`db:restore`/`e2e` at the root. Verified `db:status` = "up to date",
  `db:deploy` = "No pending migrations", `db:seed` idempotent. Seed now takes
  `SEED_ADMIN_PASSWORD` (default `admin123`) and no longer prints the password.
- Health/readiness: `/api/health` is a real probe — DB ping (logs `health db probe
  failed` on error), `status` (`ok`/`maintenance`/`down`), `version` (read from
  `package.json` via `createRequire`), `uptimeSec`, `realMoney`, `time`. New `/api/ready`
  returns 200 `{db:'up', maintenance}` or 503 `{db:'down'}`. Both are exempt from the
  maintenance gate so probes stay reachable. Verified live: `health {ok:true,status:ok,
  db:up,version:0.1.0}` and `ready {ok:true,status:ready,db:up}`.
- Structured logs: logger level now from `config.LOG_LEVEL`; redaction for
  `authorization`/`cookie` headers; structured boot line `{event:'boot', version, port,
  host, env, realMoney, rooms}`; Prisma client logs `warn`/`error`; graceful shutdown
  logs `{signal}`, closes HTTP/sockets, calls `prisma.$disconnect()` and force-exits
  after 10 s. Request logs (`incoming request`/`request completed` + `responseTime`)
  confirmed in the boot log. Also wired the previously-dead `recoverMatchValidity()` at
  boot — refunds non-practice `MATCH_STARTED` matches with reason
  `server_recovery_refund` and logs `{count}` (stale-match recovery is now real).
- Backup/restore runbook: new `scripts/db-backup.ps1` (byte-exact dump via `cmd /c`
  redirect, -> `backups/snooker-<ts>.sql`, `PGDMP` custom format) and
  `scripts/db-restore.ps1` (`docker cp` -> `pg_restore --clean --if-exists`;
  destructive, server-down). New root `RUNBOOK.md` covering boot order, migration step,
  health/readiness table, log locations, backup/restore (PS + generic *nix), monitoring
  notes, shutdown, security quicklist and Day-28 gaps. `README.md` quick-start updated to
  `cp .env.example packages/server/.env` + `db:deploy`. `backups/` added to `.gitignore`.
- Verification this day: server vitest **6/6**, `pnpm -r typecheck` clean, `pnpm -r
  build` clean (after regenerating the Prisma engine with the server briefly stopped —
  Windows holds a lock on `query_engine-windows.dll.node` during `prisma generate`), e2e
  **228 passed, 0 failed** (`e2e-day27.log`), backup produced a valid 751 KB `PGDMP`
  dump, server restarted and healthy at wrap (4000 + 5173).
- Notes: `package.json#prisma` seed wiring emits a Prisma-7 deprecation warning (fine on
  Prisma 6; migrate to `prisma.config.ts` when upgrading). Cold-boot wipe-and-restore of
  a fresh postgres volume was documented (RUNBOOK restore steps) but not executed, to
  avoid destroying the dev DB.

### Hotfix — Power slider UI + shot-clock reset (client + server, verified)
- Goal: a visible, draggable power slider with a live percentage, and a shot clock
  that restarts at 30 on every turn instead of sticking at 0 after the first shot.
- Shot-clock root causes (all in `game/room.ts`, server-owned clock unchanged):
  1. `releasePlayback()` re-armed the deadline after every replay but never told the
     clients — the last thing they had been sent was the shot-commit message with a
     null deadline, so the ring stayed down (0/absent) for the whole next turn. The
     room now broadcasts a `turn:clock` message with the fresh deadline at release.
  2. Same gap when the striker disconnects: `stopTurnTimer()` now announces the stop.
  3. `armTurnTimer()` refused to arm on the robot's visit, so the clock never
     attached to the bot's avatar; the clock is now armed on every visit (the ring
     follows whoever is at the table) while `onTurnTimeout` still never fouls the bot
     (unit-tested: 60 s past its deadline, seat 1 takes no timeout foul).
  4. A frame-ending broadcast was stamped with the striker's already-spent deadline
     (clients drew 0 through the frame ceremony); `handleFrameEnd` now clears the
     deadline before its first broadcast.
- Client (`main.ts`, `shotTimerView.ts`): new `turn:clock` socket listener adopts the
  announced timings (with a `serverNow` out-of-order guard so a queued stale message
  cannot rewind the clock); `frame:start` now passes its `turn` through (it was
  dropped, so new frames never started a clock); `applyGameUpdate` freezes the ring
  for the length of a shot replay (`ShotTimer.freeze()` — the clock holds where it
  was while the balls move and restarts at 30 when the table settles).
- Power slider (`hud.ts`, `power.ts`, `input.ts` untouched): the rail is now an
  interactive control — a handle sits on the track, click/drag anywhere sets power
  (pointer capture, clamped 0–100%), the live percentage sits above the track, and
  the value is written straight into the cue controller's `aim.power` so the cue
  pull-back tracks the handle. Keyboard-accessible (`role=slider`, arrows/PageUp-Down/
  Home/End, `aria-valuenow`, focus ring, arrows are stopped from also driving spin).
  The slider is disabled (dimmed, inert, `aria-disabled`) whenever `isVisitPlayable()`
  is false — not your visit, or balls still moving — and re-enables when the table
  settles. Power resets to 0 at the start of every new visit (existing
  `resetPower` path) and after firing (existing behaviour).
  - Follow-up fix: the rail was built complete but **never mounted** — `overlayRoot`
    was an empty div at HEAD too (which is why the review called the slider missing).
    It now hangs inside the overlay the game view attaches into the table frame
    (`hud.ts` `overlay.appendChild(rail)`), layering over the 3D canvas via the
    existing `.hud-overlay` (absolute inset-0, z-index 3, below the z-5 net overlay
    so a dropped connection still covers it). Track `overflow:hidden` removed so the
    handle is not clipped to the 12px track, and the slider element carries
    `id=power-slider` as a stable hook.
  - Follow-up fix 2 (erratic drag-drop): while the slider is mid-drag it now **owns
    the power value outright**. The HUD reports the gesture to the caller
    (`setPowerDragListener`), and main.ts locks the cue controller
    (`lockPower`/`unlockPower` in `input.ts`): the eased after-shot reset is refused
    and cancelled where it stands (it was multiplying `aim.power` toward 0 on its own
    frames — the visible "handle drops back down" bug), the charge loop stops, and
    canvas press/wheel/+/-/Space all refuse to write or fire while locked. Pointer
    capture is taken on the track at pointerdown (moves keep arriving with the cursor
    well off the rail), with a window-level pointerup/pointercancel safety net so a
    lost capture can never leave the lock stuck. `setPowerEnabled(false)` mid-gesture
    (shot fired, turn ended) ends the drag and unlocks, so the lock cannot outlive
    the visit. Verified: typecheck clean, client tests 83/83, build green.
- Tests: room.test.ts grew 5 clock tests (fresh-deadline announce on release,
  announced stop on disconnect, re-arm announce on return, no spent deadline on
  frame:end broadcast, robot visit armed-but-never-fouled); power.test.ts grew the
  slider-mapping tests (identity of `powerFromSliderValue`/`sliderValueFromPower`,
  clamping, NaN). Shared 107/107, server 39/39, client build green.
- Dev-DB repair: the ledger-invariance failures (unit ×2 + e2e ×1) were the same
  pre-existing raw-write drift Day 24 repaired (proven by stashing this change and
  rerunning on the clean tree). Repaired per the Day-24 precedent — corrective
  ADJUSTMENT + LEDGER_REPAIR rows per wallet (one wallet −1000, one +1000 drift);
  ledger suite 3/3, e2e ledger-invariant check green. Full e2e **231 passed, 0 failed**.

### Physics overhaul — WPBSA collision & two-phase cloth (shared, verified)
- Goal: authentic ball movement — near-elastic ball contact, a two-phase cloth
  model, livelier rails, and spin that survives to contact. UI/CSS untouched.
- Ball-to-ball (`constants.ts` + `world.ts`): `BALL_RESTITUTION` 0.95 → **0.96**;
  the equal-mass impulse `-(1+e)·(v_rel·n)/2` through e gives the object ball
  (1+e)/2 = **98%** of the closing pace on a full hit (analytically pinned by a new
  closed-form run-distance test), so object balls no longer die on the spot.
- Two-phase cloth: new `SLIDE_FRICTION` (1800 mm/s²) above new
  `SLIDE_SPEED_THRESHOLD` (800 mm/s) and `ROLL_FRICTION` derived as
  `CLOTH_CRR·g` = **0.018 × 9810 ≈ 177 mm/s²** (was a flat 400 at every speed).
  Deceleration is applied along the direction of travel, so the final crawl
  shrinks smoothly into the stop instead of braking in abrupt linear bites
  (pinned by a keyframe-trail test: last step < 5% of the first).
- Cushions: `CUSHION_RESTITUTION_LONG/SHORT` 0.8/0.75 → **0.85** both,
  `CUSHION_TANGENTIAL_DAMP` 0.92 → **0.85** — livelier rebounds with realistic
  angle/velocity retention, still strictly energy-losing at every angle (the
  existing per-angle cushion tests all hold unchanged).
- Cue ball: power→speed stays the exact linear map (`applyShot` clamps only the
  0..1 domain; no velocity ceiling introduced), and follow/draw kicks scale from
  contact-pace, so stun/follow/draw all behave at contact (new spin-survival
  test alongside the existing draw/follow ones).
- Tests: 8 new WPBSA-model tests (constants, per-tick slide/roll shed, momentum,
  energy transfer, glide-to-stop, spin survival); `launchSpeed` and the
  tick-distance helper updated for the phase each measured speed sits in.
  **Shared 115/115, server 39/39 (bot gate still clears reds and finishes frames),
  client 83/83, typecheck clean, e2e 231/0.**

### Arrow-key power control (client, verified)
- `↑`/`↓` now trim shot power by `POWER_ARROW_STEP` (2%) per tap whenever aiming is
  active (`enabled()` = your visit and the table settled), clamped 0–100% via the
  existing `powerAdjust`, refused while the slider lock is held, and never touching
  `aim.angle` — only `aim.power`.
- Vertical (top/bottom) spin moved from the arrows to `W`/`S`; `←`/`→` still set
  side spin. The slider keeps its own finer steps (4%) when focused. The controls
  hint text was updated to the new bindings.
- Live two-way sync: the controller fires `onChange`, which feeds `hud.setPower` →
  `renderRail` (handle position + fill) — and the keyboard path respects the
  slider-owns-power lock from the drag fix, so key and slider never fight.
- Verified: client typecheck + build green, client tests 83/83.

### AAA visual pass — 3D scene, glass HUD, event banners (client, verified)
- Balls (`scene3d.ts` BallRig): `MeshPhysicalMaterial` now phenolic-spec —
  clearcoat 1.0, clearcoatRoughness 0.1, roughness 0.12, metalness 0 — with the
  existing PMREM env map supplying the studio highlights.
- Lighting: the single directional key + fill rig is replaced by **three overhead
  spotlights** (centre + each half of the table, hung at 1650mm like real table
  lamps), each casting its own soft PCF shadow straight down onto the felt;
  hemisphere dropped to fill-only (0.5) and the cool fill to 0.3.
- Cue stick rebuilt as a proper cue: ash-shaft canvas grain (lengthwise figure,
  new `cueWoodTexture`), dark maple butt, brass ferrule + joint ring
  (metalness 0.9), chalk-blue tip; `STICK_TIP_Y` re-measured to 641mm so the tip
  still addresses the ball exactly.
- Pockets: flat discs replaced by **leather drop pockets** — recessed open-ended
  throat cylinder with a radial depth texture (BackSide), black drop floor, soft
  mouth-shadow ring on the bed, leather-look rim torus with a brass lip.
- HUD glassmorphism: `.hud-top` is now a translucent dark gradient with
  `backdrop-filter: blur(12px) saturate(1.25)`, fine light borders + inner top
  highlight and a soft drop shadow. New **ball-on value badge** (`+1`/`+2..+7`
  with the ball's own colour as a dot) derived in `deriveHudState`
  (`ballOnValue`/`ballOnDot`), hidden when any colour is on.
- Centre-screen event banners: new `#event-banner-layer` (z 6, pointer-none) with
  `hud.flashEvent(text, tone)` — scale+fade enter/exit transitions, blur-in
  keyframe (the motion-blur pass), tone variants good/bad/info, self-retiring,
  capped at 3 stacked, `prefers-reduced-motion` honoured. Wired: pots
  (`POTTED <BALLS> +N`, points summed), fouls (`FOUL -4..-7`), ball in hand
  (`BALL IN HAND`, once per state change on your visit). Existing toasts/sounds
  untouched.
- Slider drag polish re-verified in place: capture locked at pointerdown on the
  track, window-level release safety net, controller power-lock during the
  gesture (no auto-decay). No new arrow bindings added.
- Verified: client typecheck clean, client tests **83/83**, vite build green
  (0 errors). No server/shared changes.

### U1 - Client redesign, phase 1: home screen + pre-practice setup (verified)
Two sections, two commits, no game or server behaviour touched.

**Section A - the home screen (commit 0edb9a9)**
- The lobby was one scrolling column (banner, three mode cards, open tables, history,
  profile stats). It is now a screen per destination, and the first screen a signed-in
  player sees is the home screen: a **single viewport, no page scroll**, holding the
  wordmark, three cards (multiplayer / practice / tournaments) and a bottom bar of five
  equal entries.
- **Bottom bar**: Leaderboard + Settings open screens; Shop, Friends and More answer with
  a 'Coming soon' toast and call no API, because no backend exists for them here.
- **Nothing on the critical path**: the home screen is built entirely from state the app
  already holds, so it paints complete on the first frame - no skeletons, no reserved
  heights, and nothing reflows. The wallet is fetched in the background.
- **Wallet placement**: hidden from the home top bar (it would compete with the three
  things that screen is for); shown beside the stake tiers on the tables screen
  (.stake-wallet), which is where credits are about to be committed.
- **Existing flows preserved**, each on its own screen with a way home: Multiplayer
  (create-match card, open tables, match history), Tournaments (banner + bracket card),
  Leaderboard (profileStatsCard()). **Settings is new but real**: /api/me account rows
  plus the same audio.ts mute the in-game button sets.
- game/avatar.ts: the letter avatar the header drew inline is now the component the HUD
  already used - one avatar, and the HUD keeps its turn highlighting. The app name is
  the shared APP_TITLE constant.
- Style: inline SVG on the existing palette; the background slots --img-home-bg and
  --img-practice-bg sit over the existing gradient, so real art is one variable and
  nothing else moves. Glass tokens (.glass, .glass-edge) shared with the HUD.

**Section B - the pre-practice setup screen (commit d1048e6)**
- The <select> inside the lobby card is now a screen doing one job: choose the level,
  press Play. Three panes (Easy / Medium / Hard) with a **reserved** description line, so
  choosing a level never moves the Play button.
- Both sides of the matchup are the shared avatar component - the player from their name
  and the robot - and the group is a radiogroup for keyboard and screen readers.
- The flow behind it is **unchanged**: POST /practice/start with { aiLevel }, then
  enterMatch(id, true), using the server's own three values. Play is disabled while the
  request is out and restored on failure. The chosen difficulty survives a trip back to
  the lobby.
- Every exit from a match (end practice, concede, leave) now lands on the home screen.

- Verified: tsc --noEmit clean (client and all workspaces, run serially), client tests
  **308/308**, pnpm -r build green. Two commits, nothing pushed.
- Assumptions recorded: there was no player settings screen, so Settings is assembled
  from what already works; there is no shop/friends/more backend, so those entries are
  toasts rather than navigation.

### Day 28 — Final review vs Definition of Done
- Goal: confirm MVP is complete and consistent.
- Tasks: walk `development_plan.md` §17 line by line; run full regression;
  update both product/plan docs; produce the handover summary.
- Done when: DoD section has a checkbox for every item, all green.

---

## 8. Parking Lot (out of scope unless you explicitly ask)

- WebGL/3D rendering (upgrade path kept open, not scheduled).
- Free ball / miss rule complexity (decided: off for v1; can add later).
- Real-money, crypto deposits/withdrawals, KYC, jurisdiction enforcement
  (module stays disabled; requires legal setup + explicit go-ahead).
- Payments integration and real-world compliance tooling.
- Multi-region / auto-scaling / Redis queue deep work (design hooks exist only).
- Anti-cheat tuned from real gameplay data (needs live users first).
- Anything "nice to have" not listed as a phase above.
