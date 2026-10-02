import { useEffect, useRef } from 'react';
import { wiperAngle } from '../world/VehicleFactory';
import type { IntensityLevel } from '../world/Weather';

interface Drop { x: number; y: number; r: number }

/**
 * Cockpit rain on the windshield (first-person driving only).
 * Droplets bead and grow; the auto wipers sweep them away with the same
 * rhythm as the 3D blades (intermittent at low intensity, continuous at 4–5).
 */
export function WindshieldRain({ level, paused, raining, wipersActive, visible }: {
  level: IntensityLevel; paused: boolean; raining: boolean; wipersActive: boolean; visible: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const canvasVisible = useRef(true);
  const state = useRef({ level, paused, raining, wipersActive, visible });
  state.current = { level, paused, raining, wipersActive, visible };
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    let drops: Drop[] = [];
    let t = Math.random() * 10;
    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const spawnPerSec = [8, 16, 30, 55, 95];
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const { level: lv, paused: hold, raining: wet, wipersActive: sweeping, visible: show } = state.current;
      if (canvasVisible.current !== show) {
        canvasVisible.current = show;
        canvas.style.opacity = show ? '1' : '0';
        if (!show) ctx.clearRect(0, 0, w, h);
      }
      // Looking away from the windshield: freeze everything, hide the overlay.
      if (!show) return;
      if (!hold && dt > 0) {
        t += dt;
        if (wet) {
          acc += spawnPerSec[lv - 1] * dt;
          while (acc >= 1 && drops.length < 450) {
            acc -= 1;
            drops.push({ x: Math.random() * w, y: Math.random() * h * 0.92, r: 1 + Math.random() * 1.6 });
          }
        } else acc = 0;
        for (const d of drops) {
          d.r = Math.min(4.2, d.r + dt * 0.25);
          d.y += dt * 7; // airflow drag downward
          if (d.y > h + 4) { d.y = -4; d.x = Math.random() * w; }
        }
      }
      const ang = sweeping ? wiperAngle(t, lv) : 0;
      // Pivots sit just inside the bottom edge; blades rest and sweep fully on-screen.
      const bladeLen = h * 0.6;
      const blades = [
        { px: w * 0.34, py: h * 0.97 },
        { px: w * 0.66, py: h * 0.97 },
      ];
      // Tandem wipers: parked flat left, one wide ~115° sweep up the glass, fall back.
      const theta = Math.PI + 0.05 + ang;
      if (!hold && ang > 0.001) {
        // Wipe whatever the blades touch as they sweep.
        drops = drops.filter(d => {
          for (const b of blades) {
            const dx = d.x - b.px, dy = d.y - b.py;
            const dist = Math.hypot(dx, dy);
            if (dist > bladeLen) continue;
            let diff = Math.atan2(dy, dx) - theta;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            if (Math.abs(diff) < 0.055) return false;
          }
          return true;
        });
      }
      ctx.clearRect(0, 0, w, h);
      for (const d of drops) {
        ctx.globalAlpha = 0.28 + Math.min(0.4, d.r * 0.09);
        ctx.fillStyle = '#c8dcf2';
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, Math.max(0.4, d.r * 0.28), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Blades exist only mid-sweep: nothing parked along the cowl in view.
      if (ang > 0.02) {
        ctx.lineCap = 'round';
        for (const b of blades) {
          const ex = b.px + Math.cos(theta) * bladeLen, ey = b.py + Math.sin(theta) * bladeLen;
          ctx.strokeStyle = 'rgba(18, 20, 24, 0.88)';
          ctx.lineWidth = Math.max(5, h * 0.012);
          ctx.beginPath(); ctx.moveTo(b.px, b.py); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.fillStyle = 'rgba(18, 20, 24, 0.9)';
          ctx.beginPath(); ctx.arc(b.px, b.py, Math.max(4, h * 0.008), 0, Math.PI * 2); ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);
  return <canvas ref={ref} className="windshield-rain" aria-hidden="true" />;
}
