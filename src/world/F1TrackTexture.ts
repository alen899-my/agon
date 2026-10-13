import * as THREE from 'three';

/**
 * Canvas texture kit for the F1 circuit — same approach as RaceRoute's
 * canvas banners/barricades: procedural, no external assets, toneMapped off
 * for signage, sRGB for color textures.
 *
 * Seeded speckle (mulberry32) so the asphalt grain is stable frame to frame.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Asphalt with aggregate speckle + darker tire-wear bands at ±1.5m. Tiles along v. */
export function makeAsphaltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#18191a';
  ctx.fillRect(0, 0, 256, 256);
  const rand = rng(1877);
  for (let i = 0; i < 5200; i++) {
    const g = 19 + Math.floor(rand() * 18);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.floor(rand() * 256), Math.floor(rand() * 256), 1.4, 1.4);
  }
  // Tire-wear bands (u ≈ 0.38 / 0.62 map to ±1.5m on a 13m road).
  for (const u of [0.38, 0.62]) {
    const grad = ctx.createLinearGradient((u - 0.09) * 256, 0, (u + 0.09) * 256, 0);
    grad.addColorStop(0, 'rgba(18,18,22,0)');
    grad.addColorStop(0.5, 'rgba(18,18,22,0.35)');
    grad.addColorStop(1, 'rgba(18,18,22,0)');
    ctx.fillStyle = grad;
    ctx.fillRect((u - 0.09) * 256, 0, 0.18 * 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Checkered start/finish strip (13 cols × 2 rows). */
export function makeCheckerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const cols = 13;
  const rows = 2;
  const cw = 512 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f4f4f4' : '#101114';
      ctx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Generic trackside board: colored bg, bold text, thin white border. */
export function makeBoardTexture(text: string, bg: string, fg = '#ffffff', sub = ''): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 120px system-ui, sans-serif';
  ctx.fillText(text, 256, sub ? 108 : 128);
  if (sub) {
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(sub, 256, 196);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Red/white directional chevron board for corner outsides. */
export function makeChevronBoardTexture(direction: 'left' | 'right'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f4f4';
  ctx.fillRect(0, 0, 512, 192);
  ctx.fillStyle = '#d91438';
  const n = 4;
  for (let i = 0; i < n; i++) {
    const cx = 64 + i * 128;
    ctx.beginPath();
    if (direction === 'right') {
      ctx.moveTo(cx - 34, 28);
      ctx.lineTo(cx + 18, 96);
      ctx.lineTo(cx - 34, 164);
      ctx.lineTo(cx - 2, 164);
      ctx.lineTo(cx + 50, 96);
      ctx.lineTo(cx - 2, 28);
    } else {
      ctx.moveTo(cx + 34, 28);
      ctx.lineTo(cx - 18, 96);
      ctx.lineTo(cx + 34, 164);
      ctx.lineTo(cx + 2, 164);
      ctx.lineTo(cx - 50, 96);
      ctx.lineTo(cx + 2, 28);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#101114';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 182);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Garage door plate with a white number on dark grey. */
export function makeGarageTexture(num: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#23262c';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#3a3e46';
  for (let y = 12; y < 256; y += 18) ctx.fillRect(14, y, 228, 4);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 128, 128);
  ctx.strokeStyle = '#f4f4f4';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 244);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grandstand seat stripes (red/white/grey rows). */
export function makeStandTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const rows = ['#d91438', '#f4f4f4', '#8a8f96', '#d91438', '#f4f4f4', '#43484f'];
  const rh = 128 / rows.length;
  rows.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * rh, 512, rh);
  });
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < 512; x += 16) ctx.fillRect(x, 0, 5, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Catch-fence alpha: dark posts grid on transparent. */
export function makeFenceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(30,32,36,0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 1);
  return tex;
}
