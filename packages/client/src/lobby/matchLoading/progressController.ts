/**
 * Pure progress controller for the match loading screen.
 * No DOM — display smoothing, phase weights, min duration, and watchdog only.
 */

export type LoadPhase =
  | 'fonts'
  | 'network'
  | 'scene'
  | 'textures'
  | 'shaders'
  | 'bakes'
  | 'audio'
  | 'warmup'

/** Default phase weights; must sum to 100. */
export const PHASE_WEIGHTS: Record<LoadPhase, number> = {
  fonts: 6,
  network: 14,
  scene: 24,
  textures: 16,
  shaders: 20,
  bakes: 8,
  audio: 4,
  warmup: 8
}

export const PHASE_ORDER: readonly LoadPhase[] = [
  'fonts',
  'network',
  'scene',
  'textures',
  'shaders',
  'bakes',
  'audio',
  'warmup'
]

export const STATUS_FOR_PHASE: Record<LoadPhase, string> = {
  fonts: 'LOADING THE BOARD',
  network: 'FINDING YOUR SEAT',
  scene: 'SETTING UP THE PIECES',
  textures: 'SETTING UP THE PIECES',
  shaders: 'WINDING THE CLOCKS',
  bakes: 'WINDING THE CLOCKS',
  audio: 'ALMOST READY',
  warmup: 'ALMOST READY'
}

const WEIGHT_SUM = PHASE_ORDER.reduce((n, p) => n + PHASE_WEIGHTS[p], 0)

export interface ProgressControllerOptions {
  minMs?: number
  longerMs?: number
  watchdogMs?: number
  smoothMs?: number
  now?: () => number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
  onDisplay?: (pct: number) => void
  onLonger?: () => void
  onWatchdog?: () => void
}

export interface ProgressController {
  /** Raw weighted progress 0–100 (uncapped internal work). */
  raw(): number
  /** Monotonic smoothed display value, capped at 99 until finish. */
  displayed(): number
  report(phase: LoadPhase, fraction: number): void
  /** Mark all work done; display may go to 100 once min duration is met. */
  markReady(): void
  /** True after markReady and min duration. */
  isFullyReady(): boolean
  /** Elapsed ms since construction. */
  elapsedMs(): number
  /** Wait until ready to hand over (min duration + markReady). */
  whenReady(): Promise<void>
  /** Force completion (watchdog or error path). */
  forceComplete(): void
  dispose(): void
}

export function weightsSum(): number {
  return WEIGHT_SUM
}

export function createProgressController(opts: ProgressControllerOptions = {}): ProgressController {
  const minMs = opts.minMs ?? 1200
  const longerMs = opts.longerMs ?? 15_000
  const watchdogMs = opts.watchdogMs ?? 45_000
  const smoothMs = opts.smoothMs ?? 350
  const now = opts.now ?? (() => Date.now())
  const setTimeoutFn = opts.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = opts.clearTimeoutFn ?? clearTimeout
  const setIntervalFn = opts.setIntervalFn ?? setInterval
  const clearIntervalFn = opts.clearIntervalFn ?? clearInterval

  const startedAt = now()
  const phaseFrac: Record<LoadPhase, number> = {
    fonts: 0,
    network: 0,
    scene: 0,
    textures: 0,
    shaders: 0,
    bakes: 0,
    audio: 0,
    warmup: 0
  }

  let targetPct = 0
  let displayPct = 0
  let workDone = false
  let forced = false
  let disposed = false
  let longerFired = false
  let lastTick = startedAt

  let readyResolve: (() => void) | null = null
  const readyPromise = new Promise<void>((resolve) => {
    readyResolve = resolve
  })

  const emit = (): void => {
    opts.onDisplay?.(displayPct)
  }

  const computeRaw = (): number => {
    let sum = 0
    for (const phase of PHASE_ORDER) {
      sum += PHASE_WEIGHTS[phase] * clamp01(phaseFrac[phase])
    }
    return sum
  }

  const recomputeTarget = (): void => {
    const raw = computeRaw()
    if (workDone || forced) {
      targetPct = 100
    } else {
      targetPct = Math.min(99, raw)
    }
    // Never go backwards.
    if (targetPct < displayPct) targetPct = displayPct
  }

  const tryResolveReady = (): void => {
    if (disposed) return
    if (!(workDone || forced)) return
    if (now() - startedAt < minMs) return
    // Jump to 100 only when work is done and the minimum display time has passed.
    displayPct = 100
    targetPct = 100
    emit()
    readyResolve?.()
    readyResolve = null
  }

  const tick = (): void => {
    if (disposed) return
    const t = now()
    const dt = Math.max(0, t - lastTick)
    lastTick = t

    if (!longerFired && t - startedAt >= longerMs) {
      longerFired = true
      opts.onLonger?.()
    }

    recomputeTarget()
    if (displayPct < targetPct) {
      const alpha = 1 - Math.exp(-dt / Math.max(1, smoothMs))
      displayPct = displayPct + (targetPct - displayPct) * alpha
      if (targetPct - displayPct < 0.05) displayPct = targetPct
      emit()
    }

    tryResolveReady()
  }

  const intervalId = setIntervalFn(tick, 50)
  const watchdogId = setTimeoutFn(() => {
    if (disposed || workDone) return
    forced = true
    workDone = true
    for (const phase of PHASE_ORDER) phaseFrac[phase] = 1
    displayPct = 100
    targetPct = 100
    emit()
    opts.onWatchdog?.()
    tryResolveReady()
  }, watchdogMs)

  // Ensure min-duration wake-up even if no further reports arrive.
  const minId = setTimeoutFn(() => {
    tick()
    tryResolveReady()
  }, minMs + 16)

  return {
    raw: () => computeRaw(),
    displayed: () => displayPct,
    report(phase, fraction) {
      if (disposed || forced) return
      const next = clamp01(fraction)
      if (next < phaseFrac[phase]) return
      phaseFrac[phase] = next
      recomputeTarget()
      tick()
    },
    markReady() {
      if (disposed) return
      workDone = true
      for (const phase of PHASE_ORDER) phaseFrac[phase] = Math.max(phaseFrac[phase], 1)
      recomputeTarget()
      tick()
      tryResolveReady()
    },
    isFullyReady() {
      return (workDone || forced) && now() - startedAt >= minMs && displayPct >= 99.5
    },
    elapsedMs: () => now() - startedAt,
    whenReady: () => readyPromise,
    forceComplete() {
      if (disposed) return
      forced = true
      workDone = true
      for (const phase of PHASE_ORDER) phaseFrac[phase] = 1
      displayPct = 100
      targetPct = 100
      emit()
      tryResolveReady()
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearIntervalFn(intervalId as ReturnType<typeof setInterval>)
      clearTimeoutFn(watchdogId as ReturnType<typeof setTimeout>)
      clearTimeoutFn(minId as ReturnType<typeof setTimeout>)
    }
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}
