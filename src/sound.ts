// Tiny WebAudio effects for the TV. Browsers require a user gesture before
// audio can play, so the TV view shows an "enable sound" button that calls unlockAudio().

let ctx: AudioContext | null = null

export function unlockAudio() {
  if (!ctx) ctx = new AudioContext()
  void ctx.resume()
}

export function audioUnlocked(): boolean {
  return ctx !== null && ctx.state === 'running'
}

function tone(freq: number, start: number, duration: number, type: OscillatorType, volume: number) {
  if (!ctx || ctx.state !== 'running') return
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = ctx.currentTime + start
  gain.gain.setValueAtTime(volume, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration)
}

/** Harsh double buzz for a strike. */
export function playStrike() {
  tone(110, 0, 0.45, 'sawtooth', 0.4)
  tone(82, 0, 0.45, 'square', 0.3)
}

/** Bright ding for a revealed answer. */
export function playReveal() {
  tone(880, 0, 0.15, 'triangle', 0.35)
  tone(1318, 0.12, 0.3, 'triangle', 0.3)
}

/** Quick chirp when someone buzzes in. */
export function playBuzzIn() {
  tone(660, 0, 0.1, 'square', 0.3)
  tone(990, 0.09, 0.18, 'square', 0.25)
}
