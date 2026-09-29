/** Tiny WebAudio synth for table tennis (no assets). Lazy-resumes on user gesture. */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}
function blip(freq: number, dur: number, gain = 0.12, type: OscillatorType = 'sine'): void {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
export function unlockAudio(): void { audio(); }
export function bbSound(kind: string, speedKmh = 0): void {
  if (kind === 'shoot') blip(300, 0.08, 0.1, 'triangle');
  else if (kind === 'bounce') blip(140 + Math.min(120, speedKmh * 2), 0.09, 0.16, 'sine');
  else if (kind === 'rim') { blip(220, 0.18, 0.16, 'square'); blip(330, 0.12, 0.1, 'square'); }
  else if (kind === 'board') blip(120, 0.12, 0.16, 'sine');
  else if (kind === 'swish') { blip(1200, 0.08, 0.08, 'sine'); setTimeout(() => blip(900, 0.12, 0.1, 'sine'), 70); }
  else if (kind === 'score') { blip(523, 0.1, 0.12); setTimeout(() => blip(784, 0.14, 0.12), 100); }
  else if (kind === 'rimout') blip(200, 0.15, 0.1, 'sawtooth');
}
export function ttSound(kind: string, speedKmh = 0): void {
  if (kind === 'paddle') blip(520 + Math.min(400, speedKmh * 6), 0.07, 0.14, 'triangle');
  else if (kind === 'smash') { blip(700, 0.09, 0.2, 'square'); blip(350, 0.12, 0.12, 'triangle'); }
  else if (kind === 'topspin') blip(640, 0.06, 0.12, 'sawtooth');
  else if (kind === 'table') blip(300, 0.06, 0.1, 'triangle');
  else if (kind === 'edge') { blip(900, 0.05, 0.12, 'square'); }
  else if (kind === 'net') blip(160, 0.12, 0.12, 'sine');
  else if (kind === 'point') { blip(440, 0.12, 0.12); setTimeout(() => blip(660, 0.15, 0.12), 110); }
  else if (kind === 'serve') blip(500, 0.06, 0.1, 'triangle');
}
