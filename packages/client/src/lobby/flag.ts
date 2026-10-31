/**
 * Flip to `false` to restore the previous lobby UI without deleting any of it.
 * Mount wiring lives in `main.ts` behind this flag only.
 */
export const USE_NEW_LOBBY = true

/**
 * Match loading screen with real progress and GPU warm-up before the first playable frame.
 * `false` keeps the exact previous START MATCH → enterMatch behaviour (no overlay).
 */
export const USE_LOADING_SCREEN = true

/**
 * Elevated, whole-table camera while it is somebody else's turn, with the opponent's aim
 * line and a power meter. Camera and presentation only.
 * `false` keeps the exact previous behaviour: the view the player picked, at all times.
 */
export const USE_SPECTATOR_CAM = true

/**
 * The procedural sound effects (`src/sfx/`), used by the lobby for UI clicks; originally cue, ball, cushion, pocket and roll,
 * generated in code and driven by the shot replay.
 * `false` keeps exactly the audio the game had before: the old blips, and nothing new.
 */
export const USE_NEW_SFX = true
