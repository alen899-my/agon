import type { GunClass } from '../world/Guns';

/**
 * Original side-profile gun art, one silhouette per class.
 * Flat currentColor fills so it inherits the theme ink automatically.
 */
export function GunIcon({ cls, gunKey }: { cls: GunClass; gunKey: string }) {
  const common = {
    viewBox: '0 0 64 24',
    fill: 'currentColor',
    'aria-hidden': true,
  } as const;
  if (gunKey === 'revolver') {
    return (
      <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
        <rect x="14" y="7" width="30" height="5" rx="1" />
        <circle cx="20" cy="14" r="5" />
        <rect x="16" y="2" width="4" height="5" rx="1" />
        <path d="M10 12 L14 12 L12 22 L7 22 Z" />
        <rect x="44" y="8" width="5" height="3" rx="1" />
      </svg>
    );
  }
  switch (cls) {
    case 'pistol':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="16" y="7" width="28" height="6" rx="1.5" />
          <rect x="42" y="8.5" width="4" height="3" rx="1" />
          <path d="M18 13 L24 13 L22 22 L16 22 Z" />
          <rect x="16" y="4.5" width="4" height="2.5" rx="1" />
        </svg>
      );
    case 'smg':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="14" y="7" width="26" height="7" rx="1.5" />
          <rect x="40" y="8.5" width="12" height="4" rx="1" />
          <rect x="24" y="14" width="5" height="8" rx="1" />
          <path d="M12 10 L18 10 L16 20 L10 20 Z" />
          <rect x="4" y="8" width="10" height="5" rx="1" />
        </svg>
      );
    case 'shotgun':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="20" y="7" width="30" height="4" rx="2" />
          <rect x="22" y="12" width="16" height="4" rx="2" />
          <rect x="8" y="8" width="16" height="6" rx="1.5" />
          <path d="M4 9 L10 9 L8 19 L2 19 Z" />
        </svg>
      );
    case 'rifle':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="22" y="7" width="22" height="6" rx="1.5" />
          <rect x="44" y="8.5" width="14" height="3" rx="1.5" />
          <path d="M30 13 L36 13 L34 21 L29 21 Z" />
          <path d="M14 9 L22 9 L20 18 L12 18 Z" />
          <rect x="4" y="8" width="10" height="6" rx="1" />
          <rect x="28" y="3.5" width="3" height="3.5" rx="1" />
        </svg>
      );
    case 'sniper':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="30" y="9" width="28" height="2.6" rx="1.3" />
          <rect x="16" y="7" width="20" height="6" rx="1.5" />
          <rect x="20" y="2.5" width="12" height="3.4" rx="1.7" />
          <rect x="24" y="5.5" width="2" height="2" />
          <path d="M6 9 L16 9 L14 18 L4 18 Z" />
          <rect x="48" y="13" width="2" height="7" rx="1" />
        </svg>
      );
    case 'lmg':
      return (
        <svg viewBox={common.viewBox} fill={common.fill} aria-hidden="true" className="gun-icon">
          <rect x="18" y="7" width="24" height="7" rx="1.5" />
          <rect x="42" y="8.5" width="14" height="3.4" rx="1.5" />
          <circle cx="28" cy="17" r="5" />
          <path d="M10 9 L18 9 L16 19 L8 19 Z" />
          <rect x="4" y="8" width="8" height="6" rx="1" />
          <rect x="48" y="13" width="2" height="7" rx="1" />
        </svg>
      );
  }
}
