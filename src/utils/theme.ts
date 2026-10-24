import { useEffect, useState } from 'react';

/** Light, dark, or follow the device setting. Saved per browser (not synced — each person picks their own). */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'payroll-theme';
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<(mode: ThemeMode) => void>();

export function getThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // storage blocked (private window) — fall back to the device setting
  }
  return 'system';
}

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && !!media?.matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore: the choice still applies for this visit
  }
  applyTheme(mode);
  listeners.forEach((l) => l(mode));
}

/** Call once at start-up: applies the saved theme and follows device changes while on "system". */
export function initTheme() {
  applyTheme(getThemeMode());
  media?.addEventListener('change', () => {
    if (getThemeMode() === 'system') applyTheme('system');
  });
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(getThemeMode);
  useEffect(() => {
    listeners.add(setMode);
    return () => {
      listeners.delete(setMode);
    };
  }, []);
  return [mode, setThemeMode];
}
