import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { formatShortcut, matchesShortcut, useShortcut, TOGGLE_BOTTOM_PANEL } from '../src/hooks/useShortcut';

const key = (code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('matchesShortcut', () => {
  it('matches Ctrl + ` and its Shift fallback exactly', () => {
    const [primary, fallback] = TOGGLE_BOTTOM_PANEL;
    expect(matchesShortcut(key('Backquote', { ctrlKey: true }), primary, false)).toBe(true);
    expect(matchesShortcut(key('Backquote', { ctrlKey: true, shiftKey: true }), primary, false)).toBe(false);
    expect(matchesShortcut(key('Backquote', { ctrlKey: true, shiftKey: true }), fallback, false)).toBe(true);
    expect(matchesShortcut(key('Backquote'), primary, false)).toBe(false);
  });

  it('maps mod to Ctrl off macOS and Cmd on macOS', () => {
    const s = { code: 'KeyK', mod: true };
    expect(matchesShortcut(key('KeyK', { ctrlKey: true }), s, false)).toBe(true);
    expect(matchesShortcut(key('KeyK', { metaKey: true }), s, false)).toBe(false);
    expect(matchesShortcut(key('KeyK', { metaKey: true }), s, true)).toBe(true);
  });

  it('formats labels', () => {
    expect(formatShortcut(TOGGLE_BOTTOM_PANEL[0], false)).toBe('Ctrl + `');
    expect(formatShortcut(TOGGLE_BOTTOM_PANEL[1], false)).toBe('Ctrl + Shift + `');
    expect(formatShortcut({ code: 'KeyK', mod: true }, true)).toBe('Cmd + K');
  });
});

function Probe({ onHit, allowInEditable }: { onHit: () => void; allowInEditable?: boolean }) {
  useShortcut({ code: 'Backquote', ctrl: true }, onHit, { allowInEditable });
  return <input aria-label="field" />;
}

describe('useShortcut', () => {
  it('fires on window keydown and skips editable targets by default', () => {
    const hit = vi.fn();
    const { getByLabelText } = render(<Probe onHit={hit} />);
    fireEvent.keyDown(window, { code: 'Backquote', ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(getByLabelText('field'), { code: 'Backquote', ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('fires in editable targets when allowed', () => {
    const hit = vi.fn();
    const { getByLabelText } = render(<Probe onHit={hit} allowInEditable />);
    fireEvent.keyDown(getByLabelText('field'), { code: 'Backquote', ctrlKey: true });
    expect(hit).toHaveBeenCalledTimes(1);
  });
});
