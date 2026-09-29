import { physique } from '../systems/LevelManager';
export function PhysiquePreview({ level }: { level: number }) {
  const muscle = physique(level).muscle;
  return <svg className="physique-preview" viewBox="0 0 180 180" role="img" aria-label={`Level ${level} muscular stickman`}>
    <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="m82 116-11 26-11 23m36-49 12 26 11 23" strokeWidth={9 + muscle * 8} />
      <path d="m72 76-25 17-15-28m74 11 25 17 15-28" strokeWidth={9 + muscle * 13} />
      <path d={`M${76 - muscle * 12} 74 Q90 64 ${104 + muscle * 12} 74 L101 119H79Z`} fill="currentColor" strokeWidth="6" />
      <circle cx="90" cy="45" r="18" fill="currentColor" />
      <path d="M74 42h32M79 118h22" stroke="var(--surface)" strokeWidth="5" />
    </g>
  </svg>;
}
