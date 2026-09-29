import type { Theme } from '../game/State';
const NEXT: Record<Theme, Theme> = { light: 'color', color: 'dark', dark: 'light' };
const LABEL: Record<Theme, string> = { light: '◑ Day', color: '● Color', dark: '◐ Night' };
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  const next = NEXT[theme];
  return <button className="control" aria-label={`World look: ${theme}. Switch to ${next}`} aria-pressed={theme === 'dark'}
    onClick={() => onChange(next)}>
    {LABEL[theme]}
  </button>;
}
