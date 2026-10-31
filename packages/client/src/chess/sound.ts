/**
 * Short wooden "click" for a move and a heavier knock for a capture, synthesised so the
 * board needs no audio files. Honours the app-wide mute.
 */
import { isSoundMuted, sharedAudioContext } from '../game/audio.js'

export function playMoveSound(capture: boolean): void {
  if (isSoundMuted()) return
  const ctx = sharedAudioContext()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    const length = Math.floor(ctx.sampleRate * 0.08)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 6)
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = capture ? 900 : 1800
    filter.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(capture ? 0.9 : 0.6, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
    noise.connect(filter).connect(gain).connect(ctx.destination)
    noise.start(now)
    noise.stop(now + 0.12)
  } catch {
    /* audio unavailable: moves are silent */
  }
}
