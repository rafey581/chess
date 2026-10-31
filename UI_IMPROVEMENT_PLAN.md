# UI Improvement Plan — Chess Arena

> Written while the game was snooker. The game screen has since been replaced with a
> chess board (`packages/client/src/chess/`); the auth, lobby, component and
> accessibility work below carried over unchanged. Game-screen items are updated for
> chess; the progress notes are kept as the record of what was done at the time.

## Progress Log

Updated as work lands. Status: **Phases 1–4 and 7 substantially done; Phase 5 and 6 partly done.**

### What is already in place

| Phase | Status | Notes |
|-------|--------|-------|
| 1. Design tokens | Done | Arena palette, gold/felt/wood scales, display/body/score fonts all in `:root`. |
| 2. Auth screen | Done | Arena backdrop, glass card, brand lockup, tabbed Login/Register, gold submit, disclaimer footer. |
| 3. Lobby | Done | Sticky header, featured banner, mode cards, open-tables strip, stat tiles. |
| 4. Components | Done | Buttons, cards, inputs, header, notifications, overlays. |
| 5. Animations | Partly | Button shine/lift, card hover, auth entrance, page transition, skeleton shimmer, score tick. |
| 6. Game screen | Done (chess) | Board with legal-move hints, last-move/check highlights, player cards with clocks and games won, captured material, move list, promotion picker. |
| 7. Responsive & a11y | Done | 768/480 breakpoints, global `:focus-visible`, global `prefers-reduced-motion`, contrast audited. |

### Correctness work done alongside the visual work

These were not in the original plan but had to be fixed to make the UI honest:

- **The featured lobby banner was inert.** It hard-coded a headline, a prize pool and
  a player count, and the "JOIN NOW" button had an empty handler and a
  `// TODO: Navigate to tournament`. It now reads from `/tournaments/open` and
  `/tournaments/mine` and joins the tournament it is describing. With nothing open it
  says so and offers the one action that still works.
- **"Live Tables" was a placeholder.** It printed "No active tables right now" without
  ever asking the server, and `tablesCard()` sat unused. It now reads `/matches/lobby`.
  Note the endpoint only returns `WAITING_FOR_PLAYER` matches, so the section is
  labelled **Open Tables** — calling it "live" would overstate what is shown.
- **The auth error banner was styled but never shown.** `.auth-error` existed in CSS and
  an element with that id was created, but failures went to a toast. Failures now render
  in the card as a live region.
- **The auth form was not a form.** No `<form>`, so Enter did not submit; labels were not
  associated with inputs. Now a real form with `for`/`id` pairing, Enter-to-submit, and
  a disabled/pending state on the button.
- **Contrast failures.** `.tier-chip.active` was white on gold at 2.3:1, the danger button
  3.8:1, the shot-clock seconds 3.2:1 in its warn state. All now meet 4.5:1. Added a
  `--danger-solid` token for filled danger surfaces, since `--danger` is a text/icon tint.
- **Leftover GitHub-dark colours.** `.hud-frame.is-turn` had a green glow on a gold
  border, unread notifications had a green tint, and a disabled handle used a hard-coded
  GitHub grey. All moved onto theme tokens.

### Still to do

- [x] Chess screen checked in a browser at 1280×800 and 390×844 (no horizontal
      overflow on the phone). Lobby screens at 768 / 480 still to be checked.
- [ ] Piece-move animation (sliding a piece from square to square) on the chess board;
      today a move appears instantly.
- [ ] Add a `prefers-contrast` pass if high-contrast support is wanted beyond 4.5:1.
- [ ] Lobby: tournament card and open-tables strip both fetch; consider a single refresh
      so they cannot disagree for a moment.

### Needs a decision: two overlapping "find a table" UIs

`tablesCard()` is a working, tier-tabbed **"Tables — pick your price"** browser (per-tier
sections, stake display, Join buttons, a Refresh button). It was live in `HEAD`:

```
HEAD, renderLobby:  app.appendChild(await tablesCard())
```

An earlier uncommitted session removed that call site and put a hard-coded
"Live Tables" placeholder in its place, which orphaned the function. The fix here
replaced the placeholder with a working **Open Tables** strip (`openTablesStrip()`,
`/matches/lobby`), so both now do the same job and `tablesCard()` is unreferenced.

`tablesCard()` is therefore dead code (~75 lines) **and** a second `/matches/lobby`
fetch. Left in place deliberately: it is working, previously-shipped functionality, and
deleting it is a product call, not a cleanup call. The options are:

| Option | Effect |
|--------|--------|
| Delete `tablesCard()`, keep the strip | One surface, matches the plan's horizontal-strip mockup, drops the duplicate fetch. Loses per-tier tab grouping. |
| Delete the strip, restore `tablesCard()` | Keeps the richer browser and the tier tabs; less like the plan's mockup. |
| Render both | Most functionality, but two overlapping UIs and a duplicate fetch. |

### Known pre-existing failures (not caused by this work)

`packages/server` `src/wallet/ledger.test.ts` fails 2 tests
("holds across a full match lifecycle", "holds under adversarial ledger operations").
Verified failing on a clean tree with these changes stashed. Out of scope here.

---

## Current State Assessment

The app uses **vanilla TypeScript** with a single `styles.css` and direct DOM manipulation. The current UI has a generic "GitHub dark" look — functional but not immersive.

---

## Design Vision

Transform the UI into a **premium, tournament-quality chess experience** inspired by:
- **Broadcast chess coverage** — dark arena, spotlight on the board, clear clocks
- **Classic chess clubs** — warm wood board tones, brass/gold accents
- **Modern sports apps** — smooth animations, glassmorphism, polished micro-interactions

---

## Phase 1: Design System & Theme Overhaul

### 1.1 Color Palette — "Arena Night"
Replace the generic dark theme with an arena-inspired palette (the green `--felt` tokens date from the snooker build and are still defined):

| Token | Current | New | Usage |
|-------|---------|-----|-------|
| `--bg` | `#0d1117` | `#0a0a0f` | Deep arena black |
| `--panel` | `#161b22` | `#12121a` | Card backgrounds |
| `--panel-2` | `#1c2129` | `#1a1a24` | Elevated surfaces |
| `--felt` | `#0a6e3e` | `#0d5c36` | Table felt (richer) |
| `--wood` | `#3c2415` | `#2a1810` | Dark mahogany |
| `--accent` | `#238636` | `#c9a84c` | Gold/brass (primary) |
| `--accent-2` | `#2ea043` | `#e8c872` | Light gold (hover) |
| `--text` | `#e6edf3` | `#f0ece4` | Warm white |
| `--muted` | `#8b949e` | `#7a7a8a` | Cool grey |
| `--danger` | `#da3633` | `#e74c3c` | Softer red |
| `--ok` | `#2ea043` | `#27ae60` | Emerald green |

### 1.2 Typography
- **Display font**: "Playfair Display" or "Cormorant Garamond" (serif, elegant — for headings/brand)
- **Body font**: "Inter" or system sans (clean, readable)
- **Score/numbers**: "Oswald" or "Bebas Neue" (condensed, broadcast-style)
- Load from Google Fonts in `index.html`

### 1.3 New CSS Custom Properties
```css
:root {
  /* Arena theme */
  --bg: #0a0a0f;
  --bg-gradient: radial-gradient(ellipse at 50% 0%, #1a1a2e 0%, #0a0a0f 70%);
  --panel: rgba(18, 18, 26, 0.85);
  --panel-border: rgba(201, 168, 76, 0.15);
  --glass: rgba(255, 255, 255, 0.03);
  
  /* Gold accent system */
  --gold: #c9a84c;
  --gold-light: #e8c872;
  --gold-dark: #a08030;
  --gold-glow: rgba(201, 168, 76, 0.3);
  
  /* Felt & wood */
  --felt: #0d5c36;
  --felt-dark: #094a2a;
  --wood: #2a1810;
  --wood-light: #4a2c1a;
  
  /* Typography */
  --font-display: 'Playfair Display', serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-score: 'Oswald', sans-serif;
  
  /* Effects */
  --shadow-gold: 0 0 20px rgba(201, 168, 76, 0.15);
  --shadow-card: 0 8px 32px rgba(0, 0, 0, 0.4);
  --radius: 12px;
  --radius-sm: 8px;
}
```

---

## Phase 2: Login / Auth Screen Redesign

### Current Issues
- Plain dark card with basic inputs
- No visual identity or branding
- Feels like a generic admin login

### New Design: "Welcome to the Arena"
- **Full-screen background**: Dark arena with subtle spotlight effect (CSS radial gradients)
- **Centered card with glassmorphism**: Frosted glass panel with gold border accent
- **Brand header**: Large serif "CHESS STAKE" with gold gradient text + crown icon
- **Animated entrance**: Card fades in with subtle scale + translate
- **Input styling**: Dark inputs with gold focus glow, floating labels
- **Button**: Gold gradient button with hover shine effect
- **Tab switch**: Elegant toggle between Login / Register with sliding indicator
- **Footer**: Subtle "Virtual credits only" disclaimer

### Key Elements
```
┌─────────────────────────────────────┐
│          ╭───────────╮              │
│          │  ♚ Logo  │              │
│          ╰───────────╯              │
│       C H E S S   S T A K E         │
│       ─── Premium Chess ───         │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Email                      │    │
│  │  ┌───────────────────────┐  │    │
│  │  │ you@example.com       │  │    │
│  │  └───────────────────────┘  │    │
│  │                             │    │
│  │  Password                   │    │
│  │  ┌───────────────────────┐  │    │
│  │  │ ••••••••••••         │  │    │
│  │  └───────────────────────┘  │    │
│  │                             │    │
│  │  ╔═══════════════════════╗  │    │
│  │  ║    ENTER THE ARENA    ║  │    │
│  │  ╚═══════════════════════╝  │    │
│  │                             │    │
│  │  New here? Create account → │    │
│  └─────────────────────────────┘    │
│                                     │
│        Virtual credits only         │
└─────────────────────────────────────┘
```

---

## Phase 3: Lobby / Main Page Redesign

### Current Issues
- Generic card-based layout
- No visual hierarchy or excitement
- Feels like a dashboard, not a game lobby

### New Design: "The Venue"
- **Top bar**: Sleek dark bar with gold logo, user profile chip, wallet display with coin icon
- **Hero section**: Large banner with "Featured Table" or daily tournament promo
- **Game mode cards**: Large, visually rich cards with icons and hover effects:
  - 🎯 **Quick Match** — "Jump into a 1v1 match"
  - 🏆 **Tournaments** — "Compete in 8-player brackets"
  - 🤖 **Practice** — "Train against the robot"
  - 📊 **Leaderboard** — "See the top players"
- **Live tables section**: Horizontal scroll of active tables with live scores
- **Stats bar**: Your rank, win rate, total frames — displayed as premium stat tiles

### Layout
```
┌──────────────────────────────────────────────────┐
│ ♚ Chess Stake       👤 Player  💰 1,000 CR  🔔  │
├──────────────────────────────────────────────────┤
│                                                  │
│  ╔═══════════════════════════════════════════╗   │
│  ║     🏆 WEEKLY TOURNAMENT — 500 CR PRIZE   ║   │
│  ║     32 players registered • Starts 8PM   ║   │
│  ║              [ JOIN NOW ]                 ║   │
│  ╚═══════════════════════════════════════════╝   │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ 🎯 Quick │  │ 🏆 Tour- │  │ 🤖 Prac- │       │
│  │  Match   │  │  nament  │  │  tice    │       │
│  │ 1v1 Now  │  │ 8-Player │  │ vs Robot │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                  │
│  ── Live Tables ──────────────────────────────   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │Table 1  │ │Table 2  │ │Table 3  │ │Table 4  │    │
│  │Player A │ │Player C │ │Player E │ │Player G │    │
│  │   vs    │ │   vs    │ │   vs    │ │   vs    │    │
│  │Player B │ │Player D │ │Player F │ │Player H │    │
│  │ 42-38   │ │ 12-5    │ │ 67-64   │ │ 0-0     │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
│                                                  │
│  ── Your Stats ───────────────────────────────   │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    │
│  │ Rank   │ │ Win %  │ │ Frames │ │ Streak │    │
│  │ #42    │ │ 68%    │ │ 156    │ │ W5     │    │
│  └────────┘ └────────┘ └────────┘ └────────┘    │
└──────────────────────────────────────────────────┘
```

---

## Phase 4: Component-Level Improvements

### 4.1 Buttons
- **Primary**: Gold gradient, subtle glow on hover, shine animation
- **Secondary**: Dark with gold border, fills on hover
- **Ghost**: Transparent, subtle hover background
- **Danger**: Red gradient for destructive actions

### 4.2 Cards
- Glassmorphism: `backdrop-filter: blur(12px)`, semi-transparent background
- Gold border on hover with glow shadow
- Subtle gradient overlay
- Smooth lift animation on hover (`translateY(-4px)`)

### 4.3 Inputs
- Dark background with subtle inner shadow
- Gold border + glow on focus
- Floating label animation
- Icon support (left icon slot)

### 4.4 Header
- Sticky with backdrop blur
- Gold logo with crown icon
- User chip with avatar circle (first letter)
- Wallet display with coin icon and animated balance

### 4.5 Notifications
- Slide-in panel from right
- Unread indicator with gold dot
- Smooth mark-all-read animation

### 4.6 Modals/Dialogs
- Backdrop blur overlay
- Scale-in animation
- Gold accent border on top

---

## Phase 5: Animations & Micro-interactions

### 5.1 Page Transitions
- Fade + slide between screens (auth → lobby → game)
- 300ms ease-out transitions

### 5.2 Card Hover
- Lift: `translateY(-4px)`
- Glow: `box-shadow: 0 0 30px rgba(201, 168, 76, 0.15)`
- Border: gold border fades in

### 5.3 Button Interactions
- Hover: scale(1.02) + brightness increase
- Active: scale(0.98)
- Shine: pseudo-element sweep animation on hover

### 5.4 Loading States
- Skeleton shimmer for cards
- Pulsing gold spinner for buttons
- Smooth content fade-in when loaded

### 5.5 Score Updates
- Number tick animation (count up/down)
- Brief gold flash on score change
- Smooth bar transitions

---

## Phase 6: Game Screen (Chess Board) Polish

### 6.1 Player cards
- Dark glass bar per player with avatar, name, games won and captured material
- Active player indicator: gold border glow

### 6.2 Board
- Warm light/dark squares, coordinates on the edge
- Dots for quiet moves, rings for captures, gold last-move tint, red check glow
- Drag ghost piece follows the pointer

### 6.3 Clocks
- Large tabular digits; the running clock is inverted (light on dark → dark on light)
- Turns red under 30 seconds; tenths shown under 10 seconds

---

## Phase 7: Responsive & Accessibility

### 7.1 Breakpoints
- Desktop: full layout (current)
- Tablet (768px): stacked cards, smaller HUD
- Mobile (480px): single column, touch-friendly controls

### 7.2 Accessibility
- All interactive elements have `:focus-visible` gold outline
- `prefers-reduced-motion`: disable all animations
- Minimum contrast ratio: 4.5:1 for text
- ARIA labels on all icon buttons

---

## Implementation Order

| Priority | Task | Files |
|----------|------|-------|
| 1 | Update CSS custom properties & design tokens | `styles.css` |
| 2 | Add Google Fonts to `index.html` | `index.html` |
| 3 | Redesign auth/login screen | `main.ts` (renderAuth) + `styles.css` |
| 4 | Redesign lobby/main page | `main.ts` (renderLobby) + `styles.css` |
| 5 | Polish header & navigation | `main.ts` (header) + `styles.css` |
| 6 | Add animations & transitions | `styles.css` |
| 7 | Polish game screen | `chess/chessView.ts` + `chess/chess.css` |
| 8 | Responsive refinements | `styles.css` |

---

## Files to Modify

1. **`packages/client/index.html`** — Add Google Fonts, update meta
2. **`packages/client/src/styles.css`** — Complete theme overhaul
3. **`packages/client/src/main.ts`** — Auth screen, lobby, header, card components
4. **`packages/client/src/chess/chessView.ts`, `chess.css`** — Board, player cards, clocks, move list

---

## Success Criteria

- [ ] Login screen looks like a premium chess club entrance
- [ ] Lobby feels like a real chess hall with live tables
- [ ] Gold/arena theme is consistent across all screens
- [ ] Smooth animations on all interactions
- [ ] Responsive on tablet and mobile
- [ ] Accessible (keyboard nav, screen readers, reduced motion)
- [ ] No functionality regressions — all features still work
