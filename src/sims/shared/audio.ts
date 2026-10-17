/**
 * Tiny sound engine for spike "clicks", like the audio monitor in an electrophysiology rig.
 * Nothing plays until the student turns sound on, and the AudioContext is only created
 * after a user gesture, as browsers require.
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** A short, soft click. `pitch` shifts the click's tone so two cells can be told apart. */
export function click(pitch = 1, volume = 0.35): void {
  const ac = context();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(380 * pitch, now + 0.025);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

/** Call from a click handler so later sounds are allowed to play. */
export function unlockAudio(): void {
  context();
}
