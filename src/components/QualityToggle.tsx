import type { QualityLevel } from '../world/WorldEngine';
const ORDER: QualityLevel[] = ['low', 'balanced', 'high', 'ultra'];
const LABEL: Record<QualityLevel, string> = { low: 'LOW', balanced: 'BAL', high: 'HIGH', ultra: 'ULTRA' };
export function QualityToggle({ quality, onChange }: { quality: QualityLevel; onChange: (q: QualityLevel) => void }) {
  const next = ORDER[(ORDER.indexOf(quality) + 1) % ORDER.length];
  return <button className="control" aria-label={`Graphics quality: ${quality}. Switch to ${next}`} title="Graphics quality (pixel sharpness + shadows). Saved on this device."
    onClick={() => onChange(next)}>
    Q:{LABEL[quality]}
  </button>;
}
