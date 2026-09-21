import { useEffect, useRef } from 'react';

/**
 * A keyboard shortcut matched on the PHYSICAL key (`KeyboardEvent.code`), so it
 * works on every keyboard layout (e.g. `Backquote` is the key left of `1`).
 * `mod` means Ctrl on Windows/Linux and Cmd on macOS.
 */
export interface Shortcut {
  code: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  mod?: boolean;
}

type KeyState = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'>;

export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

export function matchesShortcut(event: KeyState, shortcut: Shortcut, isMac = isMacPlatform()): boolean {
  if (event.code !== shortcut.code) return false;
  let ctrl = Boolean(shortcut.ctrl);
  let meta = Boolean(shortcut.meta);
  if (shortcut.mod) {
    if (isMac) meta = true;
    else ctrl = true;
  }
  return (
    event.ctrlKey === ctrl &&
    event.metaKey === meta &&
    event.shiftKey === Boolean(shortcut.shift) &&
    event.altKey === Boolean(shortcut.alt)
  );
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

const KEY_LABELS: Record<string, string> = {
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'Space',
  Escape: 'Esc',
  Enter: 'Enter',
};

/** Human label, e.g. "Ctrl + `" or "Ctrl + Shift + `". */
export function formatShortcut(shortcut: Shortcut, isMac = isMacPlatform()): string {
  const parts: string[] = [];
  if (shortcut.ctrl || (shortcut.mod && !isMac)) parts.push('Ctrl');
  if (shortcut.meta || (shortcut.mod && isMac)) parts.push('Cmd');
  if (shortcut.alt) parts.push(isMac ? 'Option' : 'Alt');
  if (shortcut.shift) parts.push('Shift');
  const code = shortcut.code;
  const key = KEY_LABELS[code] ?? (code.startsWith('Key') ? code.slice(3) : code.startsWith('Digit') ? code.slice(5) : code);
  parts.push(key);
  return parts.join(' + ');
}

export interface UseShortcutOptions {
  /** Default true. */
  enabled?: boolean;
  /** Fire even while focus is in an input, textarea or contenteditable. Default false. */
  allowInEditable?: boolean;
  /** Default true. */
  preventDefault?: boolean;
}

/**
 * Binds one or more shortcuts to a handler for the lifetime of the component.
 * The handler is read through a ref, so passing a new function each render does
 * not re-register the listener.
 */
export function useShortcut(
  shortcuts: Shortcut | readonly Shortcut[],
  handler: (event: KeyboardEvent) => void,
  options: UseShortcutOptions = {},
): void {
  const { enabled = true, allowInEditable = false, preventDefault = true } = options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const list = Array.isArray(shortcuts) ? shortcuts : [shortcuts as Shortcut];
  const key = JSON.stringify(list);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const parsed = JSON.parse(key) as Shortcut[];
    const isMac = isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!allowInEditable && isEditableTarget(event.target)) return;
      if (!parsed.some((s) => matchesShortcut(event, s, isMac))) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, enabled, allowInEditable, preventDefault]);
}

/** The bottom-panel toggle: Ctrl + ` with Ctrl + Shift + ` as fallback. */
export const TOGGLE_BOTTOM_PANEL: readonly Shortcut[] = [
  { code: 'Backquote', ctrl: true },
  { code: 'Backquote', ctrl: true, shift: true },
];

/** The command palette: Ctrl + K (Cmd + K on macOS). */
export const OPEN_COMMAND_PALETTE: Shortcut = { code: 'KeyK', mod: true };
