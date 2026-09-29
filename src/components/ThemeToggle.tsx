import type { Theme } from '../game/State';
export function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return <button className="control" aria-label="Dark mode" aria-pressed={theme === 'dark'}
    onClick={() => onChange(theme === 'dark' ? 'light' : 'dark')}>
    {theme === 'dark' ? '◐ Night' : '◑ Day'}
  </button>;
}
