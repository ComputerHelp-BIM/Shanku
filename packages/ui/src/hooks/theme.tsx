import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'system' | 'paper' | 'ink';
export type ResolvedTheme = 'paper' | 'ink';

const STORAGE_KEY = 'shanku.theme';
const ORDER: ThemePreference[] = ['system', 'paper', 'ink'];

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** system -> paper -> ink -> system */
  cycle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): ThemePreference | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'paper' || value === 'ink' || value === 'system' ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Start value when nothing is stored. Default "system". */
  defaultPreference?: ThemePreference;
  /** Persist the choice in localStorage. Default true. */
  persist?: boolean;
}

/**
 * Applies the theme by setting `data-theme` on <html>. "system" removes the
 * attribute so @shanku/tokens follows `prefers-color-scheme` with no JS flash.
 */
export function ThemeProvider({ children, defaultPreference = 'system', persist = true }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    typeof window === 'undefined' || !persist ? defaultPreference : readStored() ?? defaultPreference,
  );
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', preference);
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, preference);
      } catch {
        /* storage unavailable (private mode, quota): theme still applies for this session */
      }
    }
  }, [preference, persist]);

  const setPreference = useCallback((p: ThemePreference) => setPreferenceState(p), []);
  const cycle = useCallback(
    () => setPreferenceState((p) => ORDER[(ORDER.indexOf(p) + 1) % ORDER.length]),
    [],
  );
  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'ink' : 'paper') : preference;

  const value = useMemo(() => ({ preference, resolved, setPreference, cycle }), [preference, resolved, setPreference, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return ctx;
}
