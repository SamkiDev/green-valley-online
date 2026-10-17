import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const current = (): Theme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0f1113' : '#166534');
  }, [theme]);
  const toggle = useCallback(() => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('gv-theme', next); } catch { /* ignore */ }
    return next;
  }), []);
  return { theme, toggle };
}
