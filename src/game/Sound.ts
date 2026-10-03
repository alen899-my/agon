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

export function barrelSound(vol = 1): void {
  const ac = audio(); if (!ac) return;
  const now = ac.currentTime;
  const gain = Math.min(0.25, 0.16 * vol);
  // Metallic hollow drum resonance: combination of resonant triangle + detuned square clang
  const o1 = ac.createOscillator(), g1 = ac.createGain();
  o1.type = 'triangle';
  o1.frequency.setValueAtTime(170, now);
  o1.frequency.exponentialRampToValueAtTime(75, now + 0.16);
  g1.gain.setValueAtTime(gain * 0.9, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  o1.connect(g1).connect(ac.destination);
  o1.start(now); o1.stop(now + 0.22);

  const o2 = ac.createOscillator(), g2 = ac.createGain();
  o2.type = 'square';
  o2.frequency.setValueAtTime(430, now);
  o2.frequency.exponentialRampToValueAtTime(310, now + 0.12);
  g2.gain.setValueAtTime(gain * 0.45, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  o2.connect(g2).connect(ac.destination);
  o2.start(now); o2.stop(now + 0.15);
}

export function crowdCheerSound(): void {
  const ac = audio(); if (!ac) return;
  const now = ac.currentTime;
  const dur = 1.2;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ac.sampleRate;
    const env = Math.sin((t / dur) * Math.PI) * (0.8 + 0.2 * Math.sin(t * 24));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.linearRampToValueAtTime(1050, now + dur * 0.4);
  filter.frequency.linearRampToValueAtTime(700, now + dur);
  filter.Q.value = 2.0;
  const gn = ac.createGain();
  gn.gain.setValueAtTime(0.001, now);
  gn.gain.linearRampToValueAtTime(0.12, now + 0.2);
  gn.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(filter).connect(gn).connect(ac.destination);
  noise.start(now); noise.stop(now + dur);
}

export function countdownBeep(kind: 'red' | 'green'): void {
  if (kind === 'red') blip(440, 0.12, 0.16, 'square');
  else blip(880, 0.28, 0.22, 'square');
}

/** Triumphant arcade arpeggio chime when anyone enters the final lap. */
export function finalLapSound(): void {
  const ac = audio(); if (!ac) return;
  const notes = [587, 740, 880, 1174];
  notes.forEach((freq, i) => {
    setTimeout(() => blip(freq, 0.18, 0.18, 'triangle'), i * 85);
  });
}

export function crashThud(speedKmh = 0): void {
  const ac = audio(); if (!ac) return;
  const now = ac.currentTime;
  const vol = Math.min(0.5, 0.16 + speedKmh / 110);
  // Low impact thump, pitch dropping as the chassis absorbs it.
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, now);
  o.frequency.exponentialRampToValueAtTime(34, now + 0.25);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  o.connect(g).connect(ac.destination);
  o.start(now); o.stop(now + 0.3);
  // Metal crunch: short filtered noise burst.
  const dur = 0.2;
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ac.createBufferSource(); noise.buffer = buf;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = ac.createGain();
  ng.gain.setValueAtTime(vol * 0.7, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(lp).connect(ng).connect(ac.destination);
  noise.start(now); noise.stop(now + dur);
}

/** Looping rain patter (filtered noise). Idempotent start/stop; import-safe in Node. */
let rainNodes: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
export function startRainLoop(volume = 0.05): void {
  const ac = audio(); if (!ac || rainNodes) return;
  try {
    const dur = 2;
    const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), ac.currentTime + 1.2);
    src.connect(hp).connect(lp).connect(gain).connect(ac.destination);
    src.start();
    rainNodes = { src, gain };
  } catch { /* Audio unavailable. */ }
}
export function stopRainLoop(): void {
  if (!rainNodes) return;
  try {
    const { src, gain } = rainNodes;
    const ac = audio();
    if (ac) {
      gain.gain.cancelScheduledValues(ac.currentTime);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
      setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } }, 600);
    } else { try { src.stop(); } catch { /* already stopped */ } }
  } catch { /* noop */ }
  rainNodes = null;
}
/** Snow hushes the world: stop rain, halve engine master via callback. */
export function isRainLooping(): boolean { return rainNodes !== null; }

/** Dual-tone horn: polite meep for cars, air horn for rigs. */
export function horn(airHorn = false): void {
  const ac = audio(); if (!ac) return;
  const now = ac.currentTime;
  const dur = airHorn ? 0.55 : 0.28;
  const freqs = airHorn ? [392, 494] : [400, 505];
  for (const f of freqs) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = airHorn ? 'sawtooth' : 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(airHorn ? 0.07 : 0.11, now);
    g.gain.setValueAtTime(airHorn ? 0.07 : 0.11, now + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g).connect(ac.destination);
    o.start(now); o.stop(now + dur);
  }
}
