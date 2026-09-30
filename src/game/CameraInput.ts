export interface LookSettings { pointer: number; touch: number; invertY: boolean }
export type LookStatus = 'free' | 'locked' | 'fallback';
export const DEFAULT_LOOK: LookSettings = { pointer: 1, touch: 1, invertY: false };

export function readLookSettings(): LookSettings {
  try {
    const value = JSON.parse(localStorage.getItem('agon-look') ?? '{}');
    const sensitivity = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0.25, Math.min(3, n)) : 1;
    return { pointer: sensitivity(value?.pointer), touch: sensitivity(value?.touch), invertY: value?.invertY === true };
  } catch { return { ...DEFAULT_LOOK }; }
}

/** Relative desktop look and one independently captured touch pointer. */
export class CameraInput {
  private drag: { id: number; x: number; y: number } | null = null;
  private mouse: { x: number; y: number } | null = null;
  private locked = false;
  private pending = false;
  private intentionalUnlock = false;
  private disposed = false;
  private fallback = false;
  private listeners: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, private callbacks: {
    enabled: () => boolean;
    settings: () => LookSettings;
    look: (x: number, y: number) => void;
    pause: () => void;
    status: (status: LookStatus) => void;
  }) {
    this.listen(canvas, 'pointerdown', this.down);
    this.listen(canvas, 'pointermove', this.move);
    this.listen(canvas, 'pointerup', this.up);
    this.listen(canvas, 'pointercancel', this.up);
    this.listen(canvas, 'lostpointercapture', this.up);
    this.listen(canvas, 'pointerleave', () => { this.mouse = null; });
    // Mousemove is the interoperable relative input event while pointer-locked.
    this.listen(document, 'mousemove', this.relativeMove);
    this.listen(document, 'pointerlockchange', this.lockChanged);
    this.listen(document, 'pointerlockerror', this.failed);
    this.listen(window, 'blur', this.reset);
  }
  private listen(target: EventTarget, event: string, callback: (event: any) => void) {
    target.addEventListener(event, callback);
    this.listeners.push(() => target.removeEventListener(event, callback));
  }
  private apply(dx: number, dy: number, touch = false) {
    if (!this.callbacks.enabled() || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const settings = this.callbacks.settings();
    // Same swipe fraction gives the same angle on phones and tablets, independent of DPR.
    const sensitivity = touch ? settings.touch * 600 / Math.max(1, this.canvas.clientHeight) : settings.pointer;
    this.callbacks.look(dx * sensitivity, dy * sensitivity * (settings.invertY ? -1 : 1));
  }
  request = () => {
    if (this.disposed || !this.callbacks.enabled() || this.pending || document.pointerLockElement === this.canvas) return;
    this.canvas.focus(); this.mouse = null;
    if (!this.canvas.requestPointerLock) { this.failed(); return; }
    this.pending = true;
    try {
      // Keep OS-adjusted movement: it supports both mice and laptop trackpads.
      // Raw/unadjusted mouse input is deliberately not a requirement.
      const result = this.canvas.requestPointerLock();
      Promise.resolve(result).catch(this.failed);
    } catch { this.failed(); }
  };
  private failed = () => {
    if (this.disposed || document.pointerLockElement === this.canvas) return;
    this.pending = false; this.fallback = true; this.callbacks.status('fallback');
  };
  private lockChanged = () => {
    if (this.disposed) return;
    const wasLocked = this.locked;
    this.locked = document.pointerLockElement === this.canvas;
    this.pending = false; this.mouse = null;
    if (this.locked) {
      this.intentionalUnlock = false; this.fallback = false;
      if (!this.callbacks.enabled()) { this.release(); return; }
      this.callbacks.status('locked');
    } else {
      this.callbacks.status(this.fallback ? 'fallback' : 'free');
      if (wasLocked && !this.intentionalUnlock) this.callbacks.pause();
      this.intentionalUnlock = false;
    }
  };
  release = () => {
    this.reset();
    if (document.pointerLockElement === this.canvas) {
      this.intentionalUnlock = true; document.exitPointerLock();
    }
  };
  refresh = () => { if (!this.callbacks.enabled()) this.release(); };
  private reset = () => {
    this.mouse = null;
    const id = this.drag?.id; this.drag = null;
    if (id !== undefined && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  };
  private down = (event: PointerEvent) => {
    if (!this.callbacks.enabled() || event.button !== 0) return;
    if (event.pointerType === 'mouse') { this.request(); return; }
    if (this.drag) return;
    event.preventDefault(); this.canvas.focus();
    this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    this.canvas.setPointerCapture(event.pointerId);
  };
  private move = (event: PointerEvent) => {
    if (!this.callbacks.enabled()) { this.reset(); return; }
    if (event.pointerType === 'mouse') {
      // If the browser refuses capture, retain the original no-button hover look.
      if (!this.fallback || document.pointerLockElement === this.canvas) return;
      if (this.mouse) this.apply(event.clientX - this.mouse.x, event.clientY - this.mouse.y);
      this.mouse = { x: event.clientX, y: event.clientY }; return;
    }
    if (this.drag?.id !== event.pointerId) return;
    this.apply(event.clientX - this.drag.x, event.clientY - this.drag.y, true);
    this.drag.x = event.clientX; this.drag.y = event.clientY;
  };
  private relativeMove = (event: MouseEvent) => {
    if (document.pointerLockElement === this.canvas) this.apply(event.movementX, event.movementY);
  };
  private up = (event: PointerEvent) => { if (this.drag?.id === event.pointerId) this.reset(); };
  destroy() {
    this.disposed = true;
    this.listeners.forEach(remove => remove()); this.release();
  }
}
