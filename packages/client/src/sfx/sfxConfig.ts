/** Reference speed and length the sound curves were tuned against (mm/s, mm). */
const MAX_CUE_SPEED = 9000
const TABLE_LENGTH = 3569

/**
 * SFX_CONFIG — every number the sound system can be tuned by, in one object.
 *
 * Levels are in decibels relative to full scale. Every rendered buffer is normalised to
 * the same peak, so a gain in dB here is very nearly the peak of what comes out. Speeds
 * are fractions of the fastest a ball can be sent, which is the game's own
 * `MAX_CUE_SPEED` (millimetres a second), read from the shared package and not guessed.
 * Times are milliseconds. These are starting values, meant to be tuned by ear from the
 * debug panel (`?sfxdebug=1`) and pasted back in here.
 */

export type SfxTier = 'low' | 'medium' | 'high'
export type Layer = 'soft' | 'medium' | 'hard'
export const LAYERS: readonly Layer[] = ['soft', 'medium', 'hard']

/** The sounds that come in three strengths. */
export type LayeredSound = 'ball' | 'cue' | 'cushion'
/** The sounds that come in one strength, with variants. */
export type FlatSound = 'jaw' | 'drop' | 'net'
/** The short quiet ticks. */
export type AuxSound = 'uiClick' | 'uiHover' | 'placeTick' | 'turnTick' | 'chalk' | 'foul'
export type SoundType = LayeredSound | FlatSound | AuxSound

/**
 * The tunable part of a recipe. The same handful of numbers for every sound, so the debug
 * panel can edit any of them with one form: where the main pitch sits, how long it rings,
 * how much noise is in the attack, where the top is rolled off, and how much body it has.
 */
export interface RecipeParams {
  /** Main pitch, drawn between these two per variant, in Hz. */
  baseFreqMin: number
  baseFreqMax: number
  /** Time constant of the main partial, in ms. The others are scaled from it. */
  decayMs: number
  /** Level of the noise in the attack, against the main partial at 1. */
  noiseLevel: number
  /** Low-pass corner at strength 0, and how much strength 1 adds to it, in Hz. */
  lowpassBase: number
  lowpassRange: number
  /** The low body under the main pitch: its range, its decay and its level. */
  bodyFreqMin: number
  bodyFreqMax: number
  bodyDecayMs: number
  bodyLevel: number
  /** How long the rendered buffer is, in ms. */
  lengthMs: number
}

export interface SfxConfig {
  /** The fastest a ball can be sent, in the game's own units. Loudness is scaled against it. */
  vmax: number
  /** Half the table's length, for placing a sound left or right. */
  halfLength: number
  /** How far to the side a sound at the end of the table is placed, 0 to 1. */
  panWidth: number
  /** Loudness against speed: `t = (v / vmax) ^ gainCurve`. */
  gainCurve: number
  masterDb: number
  busDb: { sfx: number; rolling: number; ui: number }
  /** The safety limiter after the master. Not a mixing tool. */
  limiter: { thresholdDb: number; knee: number; ratio: number; attackMs: number; releaseMs: number }
  /** The small room: off below `high`, and never more than this much of the signal. */
  room: { seconds: number; lowpassHz: number; wet: number }
  /** Output level at the softest audible hit and at the hardest, per sound. */
  rangeDb: Record<LayeredSound | FlatSound, { min: number; max: number }> & { aux: { min: number; max: number } }
  /** Below this fraction of `vmax` a contact makes no sound. */
  ignoreBelow: { ball: number; cushion: number; jaw: number }
  /** Speed, as a fraction of `vmax`, under which a hit is soft, and under which it is medium. */
  layerBelow: { soft: number; medium: number }
  /** How strong each layer is rendered, 0 to 1. */
  layerStrength: Record<Layer, number>
  /** The same pair of things cannot sound again inside this long. */
  cooldownMs: number
  /** More than `free` impacts inside `windowMs` and the newest is turned down. */
  dense: { windowMs: number; free: number }
  /** An event older than this against real time is not played: it was skipped over. */
  catchUpMs: number
  /** How long after the drop the net rattles. */
  netDelayMs: number
  /**
   * How a recording is shaped at the moment it is played.
   *
   * The recordings are of pool balls, which are bigger than snooker balls, and a struck
   * ball rings at a pitch that goes with one over its size: a 52.5mm snooker ball rings
   * about 8.5 percent higher than a 57mm pool ball. `pitch` is that correction, per sound.
   * `jitter` is how far each hit is moved off that pitch, at random, so the same recording
   * is never heard twice exactly alike. `brightness` is the low-pass a hit is played
   * through: a gentle contact loses its top end, a hard one keeps all of it, which is what
   * makes one recording serve for a kiss and a crack.
   */
  shape: {
    pitch: Record<LayeredSound | FlatSound, number>
    jitter: number
    brightness: { softHz: number; hardHz: number; exponent: number }
  }
  tiers: Record<SfxTier, { impactVoices: number; variants: number; rollingVoices: number; room: boolean }>
  rolling: {
    /** How often the rolling voices are re-aimed, per second. */
    updateHz: number
    /** Below this fraction of `vmax` a ball's roll is silent. */
    silentBelow: number
    /** The speed, as a fraction of `vmax`, at which the roll is at its loudest. */
    fullAt: number
    /** RMS level at full speed. */
    fullDb: number
    gainExponent: number
    bandBaseHz: number
    bandRangeHz: number
    bandExponent: number
    bandQ: number
    rateMin: number
    rateMax: number
    highpassHz: number
    attackMs: number
    releaseMs: number
    flutterHzMin: number
    flutterHzMax: number
    flutterDepth: number
    rumbleHzMin: number
    rumbleHzMax: number
    rumbleDb: number
    loopSeconds: number
  }
  recipes: Record<LayeredSound | FlatSound, RecipeParams>
}

export const SFX_CONFIG: SfxConfig = {
  vmax: MAX_CUE_SPEED,
  halfLength: TABLE_LENGTH / 2,
  panWidth: 0.5,
  gainCurve: 0.6,
  masterDb: -3,
  // The roll on the cloth is switched off. There is no recording of it, the generated one
  // is exactly the kind of made-up sound the recordings replaced, and a real snooker ball
  // on a napped cloth is very nearly silent anyway. Bring `rolling` back up to hear it.
  busDb: { sfx: 0, rolling: -100, ui: 0 },
  limiter: { thresholdDb: -6, knee: 0, ratio: 12, attackMs: 3, releaseMs: 120 },
  room: { seconds: 0.25, lowpassHz: 6000, wet: 0.06 },
  // Tuned towards the sound of a match on television. The tip's knock is heard on the
  // gentlest touch as well as the hardest; a kiss between two balls is quiet but still
  // there; and a pot is the fullest sound on the table, the knock down into the leather
  // and the ball running away into the net, because that is the moment a frame is played for.
  rangeDb: {
    cue: { min: -12, max: -6 },
    ball: { min: -26, max: -9 },
    cushion: { min: -26, max: -12 },
    drop: { min: -18, max: -7 },
    jaw: { min: -26, max: -14 },
    // With recordings, this slot is the ball running away under the table after a pot.
    net: { min: -30, max: -20 },
    aux: { min: -30, max: -22 }
  },
  ignoreBelow: { ball: 0.02, cushion: 0.03, jaw: 0.03 },
  layerBelow: { soft: 0.18, medium: 0.5 },
  layerStrength: { soft: 0.2, medium: 0.55, hard: 0.9 },
  cooldownMs: 30,
  dense: { windowMs: 50, free: 4 },
  catchUpMs: 250,
  // The recorded drop is the ball knocking down into the pocket, about 0.7s of it; the
  // run-away under the table follows that, not the first knock.
  netDelayMs: 600,
  shape: {
    pitch: { ball: 1.085, cue: 1.04, cushion: 1, jaw: 1.05, drop: 1.05, net: 1 },
    jitter: 0.035,
    brightness: { softHz: 3200, hardHz: 17000, exponent: 0.55 }
  },
  tiers: {
    high: { impactVoices: 24, variants: 4, rollingVoices: 3, room: true },
    // The small room on phones too: a short, faint tail is what puts the clicks in an
    // arena rather than in the player's ear, and it costs one convolver.
    medium: { impactVoices: 18, variants: 3, rollingVoices: 3, room: true },
    low: { impactVoices: 12, variants: 2, rollingVoices: 2, room: false }
  },
  rolling: {
    updateHz: 20,
    silentBelow: 0.004,
    fullAt: 0.45,
    fullDb: -34,
    gainExponent: 1.2,
    bandBaseHz: 180,
    bandRangeHz: 700,
    bandExponent: 0.7,
    bandQ: 0.8,
    rateMin: 0.85,
    rateMax: 1.15,
    highpassHz: 60,
    attackMs: 80,
    releaseMs: 200,
    flutterHzMin: 0.7,
    flutterHzMax: 2,
    flutterDepth: 0.08,
    rumbleHzMin: 70,
    rumbleHzMax: 110,
    rumbleDb: -14,
    loopSeconds: 3
  },
  recipes: {
    ball: {
      baseFreqMin: 2300,
      baseFreqMax: 2900,
      decayMs: 14,
      noiseLevel: 0.4,
      lowpassBase: 2500,
      lowpassRange: 9000,
      bodyFreqMin: 420,
      bodyFreqMax: 620,
      bodyDecayMs: 18,
      bodyLevel: 0.25,
      lengthMs: 120
    },
    cue: {
      baseFreqMin: 700,
      baseFreqMax: 1100,
      decayMs: 12,
      noiseLevel: 0.35,
      lowpassBase: 1800,
      lowpassRange: 6000,
      bodyFreqMin: 250,
      bodyFreqMax: 400,
      bodyDecayMs: 25,
      bodyLevel: 0.6,
      lengthMs: 140
    },
    cushion: {
      baseFreqMin: 200,
      baseFreqMax: 240,
      decayMs: 45,
      noiseLevel: 0.35,
      lowpassBase: 900,
      lowpassRange: 3500,
      bodyFreqMin: 85,
      bodyFreqMax: 95,
      bodyDecayMs: 50,
      bodyLevel: 1,
      lengthMs: 180
    },
    jaw: {
      baseFreqMin: 1400,
      baseFreqMax: 1800,
      decayMs: 12,
      noiseLevel: 0.25,
      lowpassBase: 3000,
      lowpassRange: 0,
      bodyFreqMin: 290,
      bodyFreqMax: 310,
      bodyDecayMs: 15,
      bodyLevel: 0.6,
      lengthMs: 120
    },
    drop: {
      baseFreqMin: 130,
      baseFreqMax: 150,
      decayMs: 90,
      noiseLevel: 0.35,
      lowpassBase: 1400,
      lowpassRange: 0,
      bodyFreqMin: 65,
      bodyFreqMax: 75,
      bodyDecayMs: 120,
      bodyLevel: 1,
      lengthMs: 320
    },
    net: {
      baseFreqMin: 1000,
      baseFreqMax: 3000,
      decayMs: 3,
      noiseLevel: 1,
      lowpassBase: 4000,
      lowpassRange: 0,
      bodyFreqMin: 20,
      bodyFreqMax: 60,
      bodyDecayMs: 0,
      bodyLevel: 0,
      lengthMs: 260
    }
  }
}

/** Decibels to a linear gain. */
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}
