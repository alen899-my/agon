export type ControlIconName = 'left' | 'right' | 'gas' | 'brake' | 'drift' | 'boost' | 'horn' | 'wiper' | 'jump' | 'sprint' | 'aim' | 'fire' | 'reload' | 'weapon' | 'camera';
const paths: Record<ControlIconName, string> = {
  left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7',
  gas: 'M8 21V7a4 4 0 018 0v14H8zm3-13h2m-2 4h2m-2 4h2',
  brake: 'M5 8h14v12H5zM8 11v6m4-6v6m4-6v6',
  drift: 'M5 11l2-5h10l2 5M4 11h16v6H4zm2 6v2m12-2v2M2 3l3 1M1 7h3M3 21l3-1',
  boost: 'M13 2L5 14h6l-1 8 9-13h-6l1-7',
  horn: 'M4 10h4l8-5v14l-8-5H4zm15-2a7 7 0 010 8',
  wiper: 'M3 17L5 5h14l2 12H3zm9 0L6 9m0 0l10-2',
  jump: 'M12 20V4m-6 6l6-6 6 6M5 21h14',
  sprint: 'M13 3a2 2 0 110 4 2 2 0 010-4M8 21l3-7 4 3v4M5 11l4-3 4 2 3 3h4M11 9l-1 5H5',
  aim: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M12 7v10m-5-5h10',
  fire: 'M12 3v4m0 10v4M3 12h4m10 0h4M12 8a4 4 0 110 8 4 4 0 010-8',
  reload: 'M20 10a8 8 0 10-1 8M20 3v7h-7',
  weapon: 'M3 7h18v5h-9l-2 7H5l2-7H3V7zm12 5v3h-4',
  camera: 'M3 7h5l2-3h4l2 3h5v13H3V7zm9 3a3 3 0 110 6 3 3 0 010-6',
};
export function ControlIcon({ name }: { name: ControlIconName }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
