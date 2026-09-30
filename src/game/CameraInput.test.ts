import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraInput, DEFAULT_LOOK, type LookSettings, readLookSettings } from './CameraInput';

function event(target: EventTarget, type: string, values: Record<string, unknown> = {}) {
  target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), values));
}
function setup() {
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as unknown, exitPointerLock: vi.fn() });
  const win = new EventTarget();
  const captured = new Set<number>();
  const canvas = Object.assign(new EventTarget(), {
    clientHeight: 600, focus: vi.fn(), requestPointerLock: vi.fn(),
    hasPointerCapture: (id: number) => captured.has(id),
    setPointerCapture: (id: number) => captured.add(id), releasePointerCapture: (id: number) => captured.delete(id),
  });
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
  doc.exitPointerLock.mockImplementation(() => { doc.pointerLockElement = null; event(doc, 'pointerlockchange'); });
  canvas.requestPointerLock.mockImplementation(() => { doc.pointerLockElement = canvas; event(doc, 'pointerlockchange'); });
  let enabled = true, settings: LookSettings = { ...DEFAULT_LOOK };
  const look = vi.fn(), pause = vi.fn(), status = vi.fn();
  const input = new CameraInput(canvas as unknown as HTMLCanvasElement, { enabled: () => enabled, settings: () => settings, look, pause, status });
  return { doc, win, canvas, captured, input, look, pause, status, disable: () => { enabled = false; input.refresh(); }, settings: (next: LookSettings) => { settings = next; } };
}
afterEach(() => vi.unstubAllGlobals());
describe('camera input', () => {
  it('uses relative movement only once while captured, even with a stationary cursor', () => {
    const s = setup(); s.input.request();
    event(s.doc, 'mousemove', { clientX: 400, clientY: 300, movementX: 12, movementY: -4 });
    event(s.canvas, 'pointermove', { pointerType: 'mouse', clientX: 400, clientY: 300 });
    event(s.doc, 'mousemove', { clientX: 400, clientY: 300, movementX: 12, movementY: -4 });
    expect(s.look.mock.calls).toEqual([[12, -4], [12, -4]]); expect(s.status).toHaveBeenCalledWith('locked');
    s.input.destroy();
  });
  it('does not rotate while the free cursor moves through the world', () => {
    const s = setup();
    event(s.canvas, 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    event(s.doc, 'mousemove', { movementX: 500, movementY: 200 });
    expect(s.look).not.toHaveBeenCalled(); s.input.destroy();
  });
  it('pauses on external capture loss but not an intentional menu release', () => {
    const s = setup(); s.input.request(); s.doc.exitPointerLock();
    expect(s.pause).toHaveBeenCalledTimes(1);
    s.input.request(); s.disable(); expect(s.pause).toHaveBeenCalledTimes(1);
    expect(s.doc.pointerLockElement).toBeNull(); s.input.destroy();
  });
  it('handles rejected capture and recovers with no-click hover fallback', async () => {
    const s = setup(); s.canvas.requestPointerLock.mockRejectedValue(new Error('denied')); s.input.request();
    await Promise.resolve();
    expect(s.status).toHaveBeenCalledWith('fallback');
    event(s.canvas, 'pointermove', { pointerType: 'mouse', clientX: 300, clientY: 100 });
    expect(s.look).not.toHaveBeenCalled();
    event(s.canvas, 'pointermove', { pointerType: 'mouse', clientX: 310, clientY: 110 });
    expect(s.look).toHaveBeenCalledWith(10, 10);
    event(s.canvas, 'pointerleave');
    event(s.canvas, 'pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 });
    expect(s.look).toHaveBeenCalledTimes(1); s.input.destroy();
  });
  it('releases a delayed successful request if a menu opened meanwhile', () => {
    const s = setup(); s.canvas.requestPointerLock.mockImplementation(() => {});
    s.input.request(); s.disable(); s.doc.pointerLockElement = s.canvas; event(s.doc, 'pointerlockchange');
    expect(s.doc.pointerLockElement).toBeNull(); expect(s.pause).not.toHaveBeenCalled(); s.input.destroy();
  });
  it('owns only the look finger and releases it on cancellation or suspension', () => {
    const s = setup(); s.canvas.clientHeight = 300;
    event(s.canvas, 'pointerdown', { pointerType: 'touch', button: 0, pointerId: 7, clientX: 100, clientY: 100 });
    event(s.canvas, 'pointerdown', { pointerType: 'touch', button: 0, pointerId: 8, clientX: 0, clientY: 0 });
    event(s.canvas, 'pointermove', { pointerType: 'touch', pointerId: 8, clientX: 500, clientY: 500 });
    expect(s.look).not.toHaveBeenCalled();
    event(s.canvas, 'pointermove', { pointerType: 'touch', pointerId: 7, clientX: 110, clientY: 105 });
    expect(s.look).toHaveBeenCalledWith(20, 10);
    event(s.canvas, 'pointercancel', { pointerId: 7 });
    expect(s.captured.size).toBe(0);
    event(s.canvas, 'pointerdown', { pointerType: 'touch', button: 0, pointerId: 9, clientX: 0, clientY: 0 });
    s.disable(); expect(s.captured.size).toBe(0); expect(s.canvas.requestPointerLock).not.toHaveBeenCalled(); s.input.destroy();
  });
  it('applies sensitivity and invert-Y without accepting invalid motion', () => {
    const s = setup(); s.settings({ pointer: 2, touch: 1, invertY: true }); s.input.request();
    event(s.doc, 'mousemove', { movementX: 10, movementY: 4 });
    event(s.doc, 'mousemove', { movementX: Infinity, movementY: NaN });
    expect(s.look.mock.calls).toEqual([[20, -8]]); s.input.destroy();
    event(s.doc, 'mousemove', { movementX: 10, movementY: 4 }); expect(s.look).toHaveBeenCalledTimes(1);
  });
  it('validates stored preferences and tolerates unavailable storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"pointer":99,"touch":0,"invertY":true}' });
    expect(readLookSettings()).toEqual({ pointer: 3, touch: 0.25, invertY: true });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('unavailable'); } });
    expect(readLookSettings()).toEqual(DEFAULT_LOOK);
  });
});
