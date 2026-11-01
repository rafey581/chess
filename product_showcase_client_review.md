# Chess Platform — Product Overview (Client Review)

A professional online multiplayer chess platform — where players create accounts,
face opponents in real-time chess, and compete in matches with a full wallet
system, match prizes and platform commission.

> The platform was first built around snooker; the game has been replaced with
> chess. Everything around the game is unchanged.

---

## 1. What This Software Does

This is not just a chess game. It is a complete **online gaming platform**
where two players meet over the internet and play a real, rules-accurate chess
match. The platform handles everything around the match: accounts, finding an
opponent, playing in real time, scoring, prizes, fees and transaction history.

The whole journey:

```
Create Account
     ↓
Login
     ↓
Wallet (view balance)
     ↓
Choose a Match (set your entry amount)
     ↓
Find an Opponent
     ↓
Play Chess in Real Time
     ↓
Server Decides the Winner
     ↓
Prize & Platform Commission Applied
     ↓
Winner's Balance Updated
     ↓
Withdraw / Keep Playing
```

---

## 2. Key Features

### Player Account & Profile
- User registration and secure login.
- Personal player profile with avatar.
- Player statistics: matches played, wins, losses, win rate.
- Match history and transaction history.
- Global leaderboards and rankings.

### Online Multiplayer Chess
- Real-time 1v1 matches against real opponents.
- Match lobby: open a table or accept an invitation.
- Full chess rules on a clean, responsive board.
- Live chess clocks (5 minutes each plus 3 seconds per move).
- Turn-based play with the server enforcing every rule.

### Three Table Types
1. **One-by-One Matches** — player vs player with an entry amount; winner takes the
   prize pool minus the platform commission. Tables are priced by tier: **$1,
   $5 and $10 tables** (virtual-credits now, real-money later). Formats:
   best-of-1 / best-of-3 / best-of-5.
2. **Tournament Table** — 8-player knockout cup. Players join, the bracket is built
   automatically (Quarter-finals → Semi-finals → Final), and the champion wins the
   prize pool after commission.
3. **Practice Table (Robot AI)** — play against the computer for free.
   Choose Easy, Medium or Hard robot level to learn the game, practise tactics and
   understand the rules — no money involved.

> **Important product rule:** the robot can **only ever** appear on the practice
> table. Real 1v1 and tournament tables are always **human vs human** — the system
> will never slip a bot into a paid/competitive match as an opponent.

All three modes use the same chess rules engine, so how the game plays is
identical across practice, tournaments and direct matches.

### FIDE Chess Rules (fully automated)
- Every game follows the FIDE Laws of Chess; illegal moves are simply not possible.
- Castling, en passant and pawn promotion (choose queen, rook, bishop or knight).
- Check, checkmate and stalemate detected automatically.
- Draws as in FIDE: automatic for dead positions, fivefold repetition and the 75-move
  rule; claimed by the player for threefold repetition and the fifty-move rule; or
  agreed after a draw offer.
- Running out of time loses — unless the opponent could not possibly checkmate, then
  it is a draw. Resigning loses the game.
- Choose the game type: **single game** or **best of 3**. A win scores 1, a draw ½.
  Colours are drawn by lot. A level match is decided by an Armageddon game, so every
  match has a winner.
- Match winner automatically decided by the server.

### Game Quality
- Clean wooden-style board with clear pieces, flipped so your pieces are at the bottom.
- Tap-to-move or drag-and-drop, with legal-move hints and last-move highlights.
- Move list in standard notation, captured pieces and material balance.
- Move and capture sounds; works from phone to desktop.

### Wallet & Match Money
- Every player has a wallet with a balance.
- Entry amount is locked when you enter a match.
- Winner receives the prize automatically.
- Platform fee is taken automatically (percentage is configurable).
- Full, auditable transaction history for every move.

Example of how a match is paid (virtual credits):

```
Player A stake        = 10
Player B stake        = 10
Gross match pool      = 20
Platform commission   = 2   (10%)
Winner receives       = 18
```

### Withdrawals & Deposits
- Deposit balance into the wallet (currently virtual credits during the review phase).
- Request withdrawals from your balance.
- Complete deposit/withdrawal records for all users and admins.

### Admin Panel
- Dashboard: users, active matches, revenue, fees, suspicious activity.
- Manage users: view, search, restrict or adjust balances.
- View and replay any match move by move.
- Configure commission %, minimum/maximum stakes, match formats.
- Review deposits and withdrawals, approve or reject.

### Security & Fair Play
- Server-authoritative gameplay — the server decides outcomes, players cannot
  tamper with the result.
- Anti-cheat checks and fraud monitoring.
- Full match logs for every match (audit and dispute resolution).
- Secure passwords, protected sessions, role-based admin access.

### Built for the Future
- Virtual credits are used now, so the entire system is fully demonstrable and safe.
- The platform is architected so **cryptocurrency deposits/withdrawals** and
  **real-money matches** can be switched on later — after legal and licensing
  setup is complete — without rebuilding anything.

---

## 3. What the User Sees (Screens)

1. **Landing page** — welcome, sign up / log in.
2. **Dashboard** — balance, quick actions, recent activity.
3. **Lobby** — three table sections: 1-on-1 matches, tournaments, practice vs robot.
4. **Profile** — stats, history, achievements.
5. **Wallet** — balance, deposit, transactions.
6. **Match screen** — the chess board, both clocks, move list, games won, opponent status.
7. **Live score / result screen** — winner, prize applied, match summary.
8. **Admin panel** — full operational control.

---

## 4. How a Match Works (Step by Step)

1. Player A creates a match and sets an entry amount. The amount is locked.
2. Player B joins and their entry amount is locked.
3. Both are connected in real time. The match starts; the table opener has white in game 1.
4. Players take turns. The server checks every move, runs both clocks and detects
   checkmate, stalemate, draws and time-outs automatically.
5. When a player has won the required number of games, the server declares the winner.
6. The prize (entry pool minus platform fee) is credited to the winner instantly.
7. Match history and transactions are updated for both players.

---

## 5. What Makes This Platform Strong

- **Real chess, not a mini-game** — full rules, live clocks, professional feel.
- **Fair by design** — the server is the referee; nothing is decided in the browser.
- **Complete business loop** — from balance to match to prize to history, all in one system.
- **Ready to monetise later** — commission and prize logic already built.
- **Compliance-ready** — jurisdiction controls, KYC hooks and a disabled-by-default
  real-money module mean the legal path is a configuration step, not a rebuild.

---

## 6. Current Build Status

The software is developed in clear phases. During this review stage, the platform
runs entirely on **virtual credits** so you can test everything — accounts,
multiplayer, chess play, clocks, wallets, prizes, tournaments and the admin
panel — with no real money involved.

### Approved product rules (confirmed with the client)
1. **Bots never play real players.** The robot exists only on the practice table.
   A 1v1 or tournament opponent is always a real human — verified in code.
2. **Free practice is limited, not unlimited.** If a player's wallet balance is
   **0**, they get **3 practice matches per day**. If their balance is **more than 0**,
   practice is **unlimited**.
3. **Priced tables.** 1v1 matches are organised into **$1, $5 and $10 tables**
   (currently 100 / 500 / 1000 virtual credits; the same tiers become USD when
   real-money is enabled). A player can only enter a table whose stake they can cover.

Roadmap overview:

| Phase                  | Status          |
|------------------------|-----------------|
| Chess rules engine     | Built           |
| Game screen (board UI) | Built           |
| Accounts & wallet      | Planned         |
| 1v1 multiplayer        | Planned         |
| Practice vs robot AI   | Planned         |
| 8-player tournaments   | Planned         |
| Admin panel            | Planned         |
| Crypto / real-money    | After legal setup (module built but off) |

---

## 7. What You Can Do to Review

1. Create two accounts (Player 1 and Player 2).
2. Play a **practice match vs the robot** (Easy/Medium/Hard) — free; remember the
   free limit (3/day with an empty balance, unlimited once the balance is more than 0).
3. Create a 1v1 match on a **$1 / $5 / $10 table** from one account and join it from
   the other.
4. Play a full game of chess — check legal-move hints, clocks, promotion and checkmate.
5. Finish the match and check the winner's prize and both transaction histories.
6. Create an **8-player tournament** and fill it (use extra accounts) to see the
   bracket, rounds and champion flow.
7. Log in as admin to see users, matches, tournaments and the commission settings.

---

## 8. Notes

- All balances during this review phase are virtual credits with a starting balance
  for testing.
- Real-money and cryptocurrency features are designed but remain disabled until the
  required legal and licensing setup is completed in the target jurisdiction.
- This document describes the intended final product; detailed technical
  specifications live in `development_plan.md`.