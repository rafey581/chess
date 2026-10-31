import { APP_TITLE } from '@snooker/shared'
import './matchLoading.css'
import './matchLoadingCasino.css'
import {
  createProgressController,
  STATUS_FOR_PHASE,
  type LoadPhase,
  type ProgressController
} from './progressController.js'

export interface MatchLoadingShowOpts {
  modeLabel: string
}

export interface MatchLoadingHandle {
  report(phase: LoadPhase, fraction: number): void
  finish(): Promise<void>
  /** Resolves when the overlay has faded out and been removed. */
  readonly gone: Promise<void>
}

const TIPS = [
  'Setting up the board...',
  'Polishing the pieces...',
  'Winding the clocks...',
  'Control the centre early.',
  'Knights before bishops, usually.',
  'Castle early to keep your king safe.',
  'Almost there, take a breath.',
  'Every piece counts.',
  'Good games take a moment.'
] as const

const TIP_MS = 2400
const READY_MS = 280
const FADE_MS = 400

/**
 * Show the match loading overlay above everything.
 * Mounts on document.body so renderGame clearing `#app` cannot remove it.
 */
export function showMatchLoading(opts: MatchLoadingShowOpts): MatchLoadingHandle {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const root = document.createElement('div')
  root.className = 'ml-root'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Preparing your board')

  const bg = document.createElement('div')
  bg.className = 'ml-bg'
  bg.setAttribute('aria-hidden', 'true')

  const center = document.createElement('div')
  center.className = 'ml-center'

  const brand = document.createElement('p')
  brand.className = 'ml-mode'
  brand.textContent = APP_TITLE

  const mode = document.createElement('p')
  mode.className = 'ml-mode'
  mode.textContent = opts.modeLabel

  const stage = buildClubStage(reduced)

  const title = document.createElement('h1')
  title.className = 'ml-title'
  title.innerHTML = 'PREPARING YOUR <span class="ml-title-amber">BOARD</span>'

  const status = document.createElement('p')
  status.className = 'ml-status'
  status.setAttribute('aria-live', 'polite')
  status.textContent = STATUS_FOR_PHASE.fonts

  const tip = document.createElement('p')
  tip.className = 'ml-tip'
  tip.textContent = TIPS[0]

  const progressRow = document.createElement('div')
  progressRow.className = 'ml-progress-row'
  progressRow.setAttribute('role', 'progressbar')
  progressRow.setAttribute('aria-valuemin', '0')
  progressRow.setAttribute('aria-valuemax', '100')
  progressRow.setAttribute('aria-valuenow', '0')

  const bar = document.createElement('div')
  bar.className = 'ml-bar'
  const fill = document.createElement('span')
  fill.className = 'ml-bar-fill'
  const sheen = document.createElement('span')
  sheen.className = 'ml-bar-sheen'
  sheen.setAttribute('aria-hidden', 'true')
  bar.append(fill, sheen)

  const pctEl = document.createElement('span')
  pctEl.className = 'ml-pct'
  pctEl.textContent = '0%'

  progressRow.append(bar, pctEl)

  const readyLabel = document.createElement('p')
  readyLabel.className = 'ml-ready'
  readyLabel.textContent = 'READY'

  const longer = document.createElement('p')
  longer.className = 'ml-longer'
  longer.textContent = 'Taking a little longer than usual, thanks for your patience.'

  center.append(brand, mode, stage, title, status, tip, progressRow, readyLabel, longer)
  root.append(bg, buildHallLights(reduced), center)
  document.body.appendChild(root)

  let tipIndex = 0
  let currentPhase: LoadPhase = 'fonts'
  let finishStarted = false
  let goneResolve!: () => void
  const gone = new Promise<void>((resolve) => {
    goneResolve = resolve
  })

  const controller: ProgressController = createProgressController({
    onDisplay: (pct) => {
      const shown = Math.floor(pct)
      fill.style.transform = `scaleX(${Math.min(1, pct / 100)})`
      pctEl.textContent = `${shown}%`
      progressRow.setAttribute('aria-valuenow', String(shown))
    },
    onLonger: () => {
      longer.classList.add('ml-longer--on')
    },
    onWatchdog: () => {
      void finishInternal(true)
    }
  })

  const tipTimer = window.setInterval(() => {
    if (finishStarted) return
    tipIndex = Math.min(TIPS.length - 1, tipIndex + 1)
    const next = TIPS[tipIndex]!
    if (reduced) {
      tip.textContent = next
      return
    }
    tip.classList.add('ml-tip--swap')
    window.setTimeout(() => {
      tip.textContent = next
      tip.classList.remove('ml-tip--swap')
    }, 300)
    if (tipIndex >= TIPS.length - 1) {
      window.clearInterval(tipTimer)
    }
  }, TIP_MS)

  const setPhaseStatus = (phase: LoadPhase): void => {
    if (phase === currentPhase) return
    currentPhase = phase
    status.textContent = STATUS_FOR_PHASE[phase]
  }

  async function finishInternal(fromWatchdog = false): Promise<void> {
    if (finishStarted) return gone
    finishStarted = true
    window.clearInterval(tipTimer)

    if (!fromWatchdog) controller.markReady()
    else controller.forceComplete()

    await controller.whenReady()

    stage.classList.add('ml-stage--ready')
    root.classList.add('ml-root--ready')
    status.textContent = 'ALMOST READY'
    fill.style.transform = 'scaleX(1)'
    pctEl.textContent = '100%'
    progressRow.setAttribute('aria-valuenow', '100')

    await sleep(READY_MS)
    root.classList.add('ml-root--fade')
    await sleep(FADE_MS)
    root.remove()
    controller.dispose()
    goneResolve()
    return gone
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') {
      e.preventDefault()
      root.focus()
    }
  }
  root.tabIndex = -1
  root.focus({ preventScroll: true })
  root.addEventListener('keydown', onKey)

  return {
    report(phase, fraction) {
      setPhaseStatus(phase)
      try {
        controller.report(phase, fraction)
      } catch (err) {
        console.warn('[match-loading] phase report failed', phase, err)
      }
    },
    finish: () => finishInternal(false),
    gone
  }
}

/** Prefetch lobby background so the overlay paint is warm. */
export function ensureLobbyBgReady(): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = '/lobby-pic-blurred.jpg'
    if (img.complete) resolve()
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The hall around the loading table: two slow sweeping spotlights, a gold glow behind the
 * table, and coins drifting down. All of it decoration under the content, moved only by
 * transforms; with motion turned down, the lights stand still and the coins stay away.
 */
function buildHallLights(reduced: boolean): HTMLElement {
  const hall = document.createElement('div')
  hall.className = 'ml-hall'
  hall.setAttribute('aria-hidden', 'true')
  const glow = document.createElement('div')
  glow.className = 'ml-hall-glow'
  const beamA = document.createElement('div')
  beamA.className = 'ml-hall-beam'
  const beamB = document.createElement('div')
  beamB.className = 'ml-hall-beam ml-hall-beam--b'
  hall.append(glow, beamA, beamB)
  if (!reduced) {
    for (let i = 0; i < 14; i++) {
      const coin = document.createElement('span')
      coin.className = i % 3 === 0 ? 'ml-coin ml-coin--green' : 'ml-coin'
      coin.textContent = i % 3 === 0 ? '₮' : '$'
      coin.style.setProperty('--x', `${(i * 41) % 100}%`)
      coin.style.setProperty('--size', `${20 + ((i * 7) % 20)}px`)
      coin.style.setProperty('--dur', `${7 + ((i * 3) % 6)}s`)
      coin.style.setProperty('--delay', `${-((i * 1.3) % 9)}s`)
      coin.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (24 + ((i * 13) % 40))}px`)
      hall.appendChild(coin)
    }
  }
  return hall
}

/** A small chessboard with a knight hopping between squares - CSS-only motion. */
function buildClubStage(reduced: boolean): HTMLElement {
  const stage = document.createElement('div')
  stage.className = 'ml-stage'
  stage.setAttribute('aria-hidden', 'true')

  const orbit = document.createElement('div')
  orbit.className = 'ml-orbit'
  const beadA = document.createElement('span')
  beadA.className = 'ml-orbit-bead'
  const beadB = document.createElement('span')
  beadB.className = 'ml-orbit-bead ml-orbit-bead--dim'
  orbit.append(beadA, beadB)

  const board = document.createElement('div')
  board.className = 'ml-chessboard'
  for (let i = 0; i < 64; i++) {
    const sq = document.createElement('span')
    sq.className = (Math.floor(i / 8) + i) % 2 === 0 ? 'ml-csq ml-csq--light' : 'ml-csq ml-csq--dark'
    board.appendChild(sq)
  }
  const pieces: Array<[string, number, number, boolean]> = [
    ['\u265A', 4, 7, false], ['\u265B', 3, 7, false], ['\u265F', 2, 6, false], ['\u265F', 5, 6, false],
    ['\u265A', 4, 0, true], ['\u265C', 0, 0, true], ['\u265F', 3, 1, true], ['\u265F', 4, 3, true]
  ]
  for (const [glyph, file, rank, white] of pieces) {
    const p = document.createElement('span')
    p.className = `ml-cpiece ${white ? 'ml-cpiece--w' : 'ml-cpiece--b'}`
    p.textContent = glyph
    p.style.left = `${file * 12.5}%`
    p.style.top = `${(7 - rank) * 12.5}%`
    board.appendChild(p)
  }
  const knight = document.createElement('span')
  knight.className = `ml-cpiece ml-cpiece--w ml-knight${reduced ? '' : ' is-moving'}`
  knight.textContent = '\u265E'
  board.appendChild(knight)

  stage.append(orbit, board)
  return stage
}

export { STATUS_FOR_PHASE }
export type { LoadPhase }
