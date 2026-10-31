/**
 * The chess match screen: the board, both players' clocks and game scores, the move list
 * and the captured pieces.
 *
 * It owns no networking. The caller hands it the server's snapshot and clocks and is told,
 * through `onMove`, when the player has made a move. Legal-move highlighting runs the same
 * shared rules engine the server enforces, so the board never offers a move the server
 * would refuse.
 */
import {
  colorOf,
  findLegalMove,
  legalMoves,
  makeMove,
  parseFen,
  squareIndex,
  squareName,
  typeOf
} from '@snooker/shared'
import type { ChessMoveInput, ChessPosition, ChessSnapshot, Piece, PromotionPiece } from '@snooker/shared'
import { playMoveSound } from './sound.js'
import './chess.css'

export interface ChessClockTiming {
  turnDeadlineAt: number | null
  serverNow: number
  paused: boolean
  clocksMs?: [number, number]
  turnSeat?: number | null
}

export interface ChessViewMeta {
  framesWon: [number, number]
  frameIndex: number
  format: string
  practice: boolean
}

export interface ChessPlayerInfo {
  name: string
  avatarUrl?: string | null
  isBot?: boolean
}

export interface ChessViewOptions {
  /** Called with a move the player made on the board. */
  onMove: (move: ChessMoveInput) => void
}

export interface ChessView {
  root: HTMLElement
  /** Left of the top bar: leave and similar controls. */
  toolsRoot: HTMLElement
  /** Right of the top bar: sound, resign, chat, fullscreen. */
  sessionToolsRoot: HTMLElement
  /** Floats over the board (connection overlay, opponent-left banner). */
  overlayRoot: HTMLElement
  setSeat(seat: number | undefined): void
  setPlayers(you: ChessPlayerInfo, opponent: ChessPlayerInfo): void
  setMeta(meta: ChessViewMeta): void
  /** A snapshot from the server: the truth, replacing anything shown optimistically. */
  update(snapshot: ChessSnapshot | null, timing?: ChessClockTiming | null): void
  setTiming(timing: ChessClockTiming | null): void
  /** Throws away an optimistic move the server refused. */
  revert(): void
  /** Shows a banner between games ("White wins by checkmate"). */
  announce(text: string | null): void
  setInteractive(enabled: boolean): void
  destroy(): void
}

/** Filled glyphs for both colours; CSS paints them white or black. */
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function formatClock(ms: number): string {
  const total = Math.max(0, ms)
  if (total < 10_000) return `0:0${(total / 1000).toFixed(1)}`
  const secs = Math.ceil(total / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function createChessView(options: ChessViewOptions): ChessView {
  const root = el('div', 'chess-page')
  const topBar = el('div', 'chess-topbar')
  const toolsRoot = el('div', 'chess-tools chess-tools--left')
  const sessionToolsRoot = el('div', 'chess-tools chess-tools--right')
  const title = el('div', 'chess-title')
  topBar.append(toolsRoot, title, sessionToolsRoot)

  const main = el('div', 'chess-main')
  const boardCol = el('div', 'chess-board-col')
  const oppCard = playerCard()
  const youCard = playerCard()
  const boardWrap = el('div', 'chess-board-wrap')
  const board = el('div', 'chess-board')
  board.setAttribute('role', 'grid')
  board.setAttribute('aria-label', 'Chess board')
  const overlayRoot = el('div', 'chess-overlay')
  const banner = el('div', 'chess-banner')
  banner.hidden = true
  boardWrap.append(board, banner, overlayRoot)
  boardCol.append(oppCard.root, boardWrap, youCard.root)

  const side = el('aside', 'chess-side')
  side.appendChild(el('div', 'chess-side__title', 'Moves'))
  const moveList = el('ol', 'chess-moves')
  side.appendChild(moveList)
  main.append(boardCol, side)
  root.append(topBar, main)

  const squares: HTMLElement[] = []
  for (let i = 0; i < 64; i++) {
    const sq = el('div', 'chess-sq')
    sq.dataset.square = squareName(i)
    sq.setAttribute('role', 'gridcell')
    squares.push(sq)
  }

  let seat: number | undefined
  let meta: ChessViewMeta = { framesWon: [0, 0], frameIndex: 1, format: 'BO1', practice: false }
  let serverSnap: ChessSnapshot | null = null
  let shown: { position: ChessPosition; lastMove: { from: string; to: string } | null; turnSeat: number; inCheck: boolean } | null = null
  let pending = false
  let selected: number | null = null
  let targets = new Set<number>()
  let interactive = true
  let timing: ChessClockTiming | null = null
  let clockOffset = 0
  let promoEl: HTMLElement | null = null
  let lastMoveCount = -1
  let drag: { from: number; pointerId: number; ghost: HTMLElement; startX: number; startY: number; moved: boolean } | null = null

  const myColor = (): 'w' | 'b' => (serverSnap && seat !== undefined && seat !== serverSnap.whiteSeat ? 'b' : 'w')
  const flipped = (): boolean => myColor() === 'b'

  function layoutSquares(): void {
    board.replaceChildren()
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const rank = flipped() ? row : 7 - row
        const file = flipped() ? 7 - col : col
        const idx = rank * 8 + file
        const sq = squares[idx]!
        sq.className = `chess-sq ${(rank + file) % 2 === 0 ? 'is-dark' : 'is-light'}`
        sq.replaceChildren()
        if (col === 0) sq.appendChild(el('span', 'chess-coord chess-coord--rank', String(rank + 1)))
        if (row === 7) sq.appendChild(el('span', 'chess-coord chess-coord--file', 'abcdefgh'[file]))
        board.appendChild(sq)
      }
    }
  }
  let layoutFlipped: boolean | null = null

  function myTurn(): boolean {
    return !!shown && !pending && interactive && seat !== undefined && shown.turnSeat === seat && serverSnap?.result === 'PLAYING'
  }

  function render(): void {
    if (layoutFlipped !== flipped()) {
      layoutFlipped = flipped()
      layoutSquares()
    }
    const pos = shown?.position
    for (let i = 0; i < 64; i++) {
      const sq = squares[i]!
      sq.querySelector('.chess-piece')?.remove()
      sq.querySelector('.chess-dot')?.remove()
      sq.classList.remove('is-last', 'is-selected', 'is-check', 'is-target', 'is-capture')
      const piece = pos?.board[i] ?? null
      if (piece) {
        const span = el('span', `chess-piece ${colorOf(piece) === 'w' ? 'is-white' : 'is-black'}`, GLYPH[typeOf(piece)])
        span.setAttribute('aria-label', `${colorOf(piece) === 'w' ? 'white' : 'black'} ${typeOf(piece)}`)
        if (drag && drag.from === i && drag.moved) span.classList.add('is-dragging')
        sq.appendChild(span)
      }
    }
    if (shown?.lastMove) {
      squares[squareIndex(shown.lastMove.from)]?.classList.add('is-last')
      squares[squareIndex(shown.lastMove.to)]?.classList.add('is-last')
    }
    if (pos && shown?.inCheck) {
      const king = pos.board.indexOf(pos.turn === 'w' ? 'K' : 'k')
      if (king >= 0) squares[king]!.classList.add('is-check')
    }
    if (selected !== null) squares[selected]!.classList.add('is-selected')
    for (const t of targets) {
      const sq = squares[t]!
      sq.classList.add('is-target')
      if (pos?.board[t] || (pos && t === pos.epSquare)) sq.classList.add('is-capture')
      else sq.appendChild(el('span', 'chess-dot'))
    }
    board.classList.toggle('is-my-turn', myTurn())
    renderPlayers()
    renderMoves()
    renderCaptured()
  }

  function renderPlayers(): void {
    const snap = serverSnap
    const mySeat = seat ?? 0
    const oppSeat = 1 - mySeat
    const turn = shown?.turnSeat
    const youWhite = snap ? snap.whiteSeat === mySeat : true
    youCard.setColor(youWhite ? 'w' : 'b')
    oppCard.setColor(youWhite ? 'b' : 'w')
    youCard.setActive(snap?.result === 'PLAYING' && turn === mySeat)
    oppCard.setActive(snap?.result === 'PLAYING' && turn === oppSeat)
    youCard.setScore(meta.practice ? null : meta.framesWon[mySeat] ?? 0)
    oppCard.setScore(meta.practice ? null : meta.framesWon[oppSeat] ?? 0)
    const need = meta.format === 'BO5' ? 3 : meta.format === 'BO3' ? 2 : 1
    title.textContent = meta.practice
      ? 'Practice'
      : `Game ${meta.frameIndex} · first to ${need} win${need === 1 ? '' : 's'}`
    renderClocks()
  }

  function renderClocks(): void {
    const mySeat = seat ?? 0
    const clocks = currentClocks()
    youCard.setClock(clocks ? clocks[mySeat] ?? null : null)
    oppCard.setClock(clocks ? clocks[1 - mySeat] ?? null : null)
  }

  function currentClocks(): [number, number] | null {
    const base = timing?.clocksMs ?? serverSnap?.clocksMs
    if (!base) return null
    const clocks: [number, number] = [base[0], base[1]]
    if (timing && !timing.paused && timing.turnDeadlineAt !== null && timing.turnSeat !== null && timing.turnSeat !== undefined) {
      const serverNow = Date.now() + clockOffset
      clocks[timing.turnSeat] = Math.max(0, timing.turnDeadlineAt - serverNow)
    }
    return clocks
  }

  function renderMoves(): void {
    const moves = serverSnap?.moves ?? []
    if (moves.length === lastMoveCount) return
    lastMoveCount = moves.length
    moveList.replaceChildren()
    for (let i = 0; i < moves.length; i += 2) {
      const li = el('li', 'chess-move')
      li.append(el('span', 'chess-move__n', `${i / 2 + 1}.`), el('span', 'chess-move__w', moves[i]), el('span', 'chess-move__b', moves[i + 1] ?? ''))
      moveList.appendChild(li)
    }
    moveList.scrollTop = moveList.scrollHeight
  }

  function renderCaptured(): void {
    const pos = shown?.position
    if (!pos) return
    const count: Record<string, number> = {}
    for (const p of pos.board) if (p) count[p] = (count[p] ?? 0) + 1
    // Pieces missing from each side are what the other side has taken.
    const missing = (color: 'w' | 'b'): string[] => {
      const out: string[] = []
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const letter = color === 'w' ? t.toUpperCase() : t
        const gone = Math.max(0, START_COUNT[t]! - (count[letter] ?? 0))
        for (let k = 0; k < gone; k++) out.push(t)
      }
      return out
    }
    const takenByWhite = missing('b')
    const takenByBlack = missing('w')
    const score = (list: string[]) => list.reduce((s, t) => s + PIECE_VALUE[t]!, 0)
    const diff = score(takenByWhite) - score(takenByBlack)
    const youWhite = myColor() === 'w'
    youCard.setCaptured(youWhite ? takenByWhite : takenByBlack, youWhite ? 'b' : 'w', youWhite ? diff : -diff)
    oppCard.setCaptured(youWhite ? takenByBlack : takenByWhite, youWhite ? 'w' : 'b', youWhite ? -diff : diff)
  }

  function clearSelection(): void {
    selected = null
    targets = new Set()
  }

  function select(square: number): void {
    const pos = shown?.position
    if (!pos) return
    const piece = pos.board[square]
    if (!piece || colorOf(piece) !== pos.turn || colorOf(piece) !== myColor()) {
      clearSelection()
      return
    }
    selected = square
    targets = new Set(legalMoves(pos).filter((m) => m.from === square).map((m) => m.to))
  }

  function tryMove(from: number, to: number): boolean {
    const pos = shown?.position
    if (!pos || !myTurn()) return false
    const candidates = legalMoves(pos).filter((m) => m.from === from && m.to === to)
    if (candidates.length === 0) return false
    if (candidates.some((m) => m.promotion)) {
      askPromotion(from, to)
      return true
    }
    commit({ from: squareName(from), to: squareName(to) })
    return true
  }

  function commit(input: ChessMoveInput): void {
    const pos = shown?.position
    if (!pos) return
    const move = findLegalMove(pos, input)
    if (!move) return
    clearSelection()
    // Shown at once; the server's answer confirms it or `revert` takes it back.
    const next = makeMove(pos, move)
    shown = {
      position: next,
      lastMove: { from: input.from, to: input.to },
      turnSeat: 1 - (seat ?? 0),
      inCheck: false
    }
    pending = true
    playMoveSound(!!move.captured)
    render()
    options.onMove(input)
  }

  function askPromotion(from: number, to: number): void {
    promoEl?.remove()
    const color = myColor()
    const pop = el('div', 'chess-promo')
    pop.setAttribute('role', 'dialog')
    pop.setAttribute('aria-label', 'Promote pawn to')
    for (const t of ['q', 'r', 'b', 'n'] as PromotionPiece[]) {
      const btn = el('button', `chess-promo__btn chess-piece ${color === 'w' ? 'is-white' : 'is-black'}`, GLYPH[t])
      btn.type = 'button'
      btn.setAttribute('aria-label', { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[t])
      btn.onclick = () => {
        pop.remove()
        promoEl = null
        commit({ from: squareName(from), to: squareName(to), promotion: t })
      }
      pop.appendChild(btn)
    }
    const cancel = el('button', 'chess-promo__cancel', '×')
    cancel.type = 'button'
    cancel.setAttribute('aria-label', 'Cancel')
    cancel.onclick = () => {
      pop.remove()
      promoEl = null
    }
    pop.appendChild(cancel)
    boardWrap.appendChild(pop)
    promoEl = pop
  }

  function squareFromPoint(x: number, y: number): number | null {
    const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('.chess-sq')
    return target?.dataset.square ? squareIndex(target.dataset.square) : null
  }

  board.addEventListener('pointerdown', (e) => {
    const sqEl = (e.target as HTMLElement).closest<HTMLElement>('.chess-sq')
    if (!sqEl?.dataset.square || !myTurn()) return
    const idx = squareIndex(sqEl.dataset.square)
    if (selected !== null && targets.has(idx)) {
      tryMove(selected, idx)
      e.preventDefault()
      return
    }
    select(idx)
    render()
    if (selected === idx) {
      const piece = shown!.position.board[idx]!
      const ghost = el('span', `chess-piece chess-ghost ${colorOf(piece) === 'w' ? 'is-white' : 'is-black'}`, GLYPH[typeOf(piece)])
      ghost.style.fontSize = `${sqEl.clientWidth * 0.78}px`
      drag = { from: idx, pointerId: e.pointerId, ghost, startX: e.clientX, startY: e.clientY, moved: false }
      board.setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  })
  board.addEventListener('pointermove', (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) {
      drag.moved = true
      document.body.appendChild(drag.ghost)
      render()
    }
    if (drag.moved) {
      drag.ghost.style.left = `${e.clientX}px`
      drag.ghost.style.top = `${e.clientY}px`
    }
  })
  const endDrag = (e: PointerEvent): void => {
    if (!drag || drag.pointerId !== e.pointerId) return
    const d = drag
    drag = null
    d.ghost.remove()
    if (d.moved) {
      const to = squareFromPoint(e.clientX, e.clientY)
      if (to === null || to === d.from || !tryMove(d.from, to)) render()
    }
  }
  board.addEventListener('pointerup', endDrag)
  board.addEventListener('pointercancel', (e) => {
    if (drag && drag.pointerId === e.pointerId) {
      drag.ghost.remove()
      drag = null
      render()
    }
  })

  const ticker = window.setInterval(renderClocks, 100)

  return {
    root,
    toolsRoot,
    sessionToolsRoot,
    overlayRoot,
    setSeat(next) {
      seat = next
      render()
    },
    setPlayers(you, opponent) {
      youCard.setPlayer(you)
      oppCard.setPlayer(opponent)
    },
    setMeta(next) {
      meta = next
      renderPlayers()
    },
    update(snapshot, nextTiming) {
      const before = serverSnap
      serverSnap = snapshot
      if (nextTiming !== undefined) this.setTiming(nextTiming)
      const wasPending = pending
      pending = false
      if (!snapshot) {
        shown = null
        render()
        return
      }
      const isNewGame = !before || before.moves.length > snapshot.moves.length || before.whiteSeat !== snapshot.whiteSeat
      if (isNewGame) lastMoveCount = -1
      // An opponent's move (not the echo of my own) makes the move sound here.
      const grew = before && !isNewGame && snapshot.moves.length > before.moves.length
      if (grew && !wasPending) playMoveSound(snapshot.moves[snapshot.moves.length - 1]?.includes('x') ?? false)
      shown = {
        position: parseFen(snapshot.fen),
        lastMove: snapshot.lastMove,
        turnSeat: snapshot.turnSeat,
        inCheck: snapshot.inCheck
      }
      if (selected !== null && !myTurn()) clearSelection()
      if (snapshot.result !== 'PLAYING') {
        clearSelection()
        promoEl?.remove()
        promoEl = null
      }
      render()
    },
    setTiming(next) {
      timing = next
      if (next) clockOffset = next.serverNow - Date.now()
      renderClocks()
    },
    revert() {
      pending = false
      clearSelection()
      if (serverSnap) this.update(serverSnap)
    },
    announce(text) {
      banner.hidden = !text
      banner.textContent = text ?? ''
    },
    setInteractive(enabled) {
      interactive = enabled
      if (!enabled) clearSelection()
      render()
    },
    destroy() {
      window.clearInterval(ticker)
      drag?.ghost.remove()
      drag = null
      root.remove()
    }
  }
}

interface PlayerCard {
  root: HTMLElement
  setPlayer(p: ChessPlayerInfo): void
  setColor(c: 'w' | 'b'): void
  setActive(active: boolean): void
  setScore(score: number | null): void
  setClock(ms: number | null): void
  setCaptured(pieces: string[], color: 'w' | 'b', advantage: number): void
}

function playerCard(): PlayerCard {
  const root = el('div', 'chess-player')
  const avatar = el('div', 'chess-player__avatar')
  const info = el('div', 'chess-player__info')
  const name = el('div', 'chess-player__name')
  const captured = el('div', 'chess-player__captured')
  info.append(name, captured)
  const score = el('div', 'chess-player__score')
  const clock = el('div', 'chess-clock', '--:--')
  root.append(avatar, info, score, clock)
  let lastCaptured = ''
  return {
    root,
    setPlayer(p) {
      name.textContent = p.name
      avatar.replaceChildren()
      if (p.avatarUrl) {
        const img = el('img')
        img.src = p.avatarUrl
        img.alt = ''
        avatar.appendChild(img)
      } else avatar.textContent = (p.name.trim()[0] ?? '?').toUpperCase()
    },
    setColor(c) {
      root.dataset.color = c
    },
    setActive(active) {
      root.classList.toggle('is-active', active)
    },
    setScore(value) {
      score.hidden = value === null
      score.textContent = value === null ? '' : String(value)
      score.title = 'Games won'
    },
    setClock(ms) {
      clock.textContent = ms === null ? '--:--' : formatClock(ms)
      clock.classList.toggle('is-low', ms !== null && ms < 30_000)
    },
    setCaptured(pieces, color, advantage) {
      const key = `${pieces.join('')}${color}${advantage}`
      if (key === lastCaptured) return
      lastCaptured = key
      captured.replaceChildren()
      for (const t of pieces) captured.appendChild(el('span', `chess-cap ${color === 'w' ? 'is-white' : 'is-black'}`, GLYPH[t as keyof typeof GLYPH]))
      if (advantage > 0) captured.appendChild(el('span', 'chess-cap__adv', `+${advantage}`))
    }
  }
}

export type { Piece }
