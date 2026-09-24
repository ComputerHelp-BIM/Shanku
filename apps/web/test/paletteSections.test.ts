import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isNewCommand, loadUsage, paletteSections, recordUse, type AppCommand } from '../src/lib/commands';

const cmd = (id: string, extra: Partial<AppCommand> = {}): AppCommand => ({ id, title: id, group: 'View', run: () => undefined, ...extra });
const all = ['view.home', 'view.edges', 'visibility.isolateElement', 'select.clear', 'explode.storeys', 'explode.radial', 'window.qa', 'views.section', 'help.guide'].map((id) => cmd(id));

describe('command palette sections', () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      clear: () => data.clear(),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('recently used (newest first), then most used without repeats', () => {
    let t = 1000;
    for (const id of ['view.home', 'view.home', 'view.home', 'view.edges', 'view.edges', 'select.clear']) recordUse(id, (t += 10));
    const [recent, frequent] = paletteSections(all, loadUsage(), '0.28.2', 5, 2);
    expect(recent.title).toBe('Recently used');
    expect(recent.commands.map((c) => c.id)).toEqual(['select.clear', 'view.edges']);
    expect(frequent.title).toBe('Most used');
    expect(frequent.commands.map((c) => c.id)).toEqual(['view.home']); // edges already under Recently used
  });

  it('new: introduced in the last five minor releases, until first used', () => {
    expect(isNewCommand('window.qa', '0.28.2')).toBe(true); // 0.27
    expect(isNewCommand('explode.radial', '0.28.2')).toBe(true); // 0.24: four releases ago
    expect(isNewCommand('explode.radial', '0.29.0')).toBe(false); // five releases ago: no longer new
    expect(isNewCommand('window.qa', '0.25.0')).toBe(false); // not before it exists
    const s = paletteSections(all, {}, '0.25.0').find((x) => x.id === 'new')!;
    expect(s.title).toBe('New in Shanku 0.25');
    expect(s.commands.map((c) => c.id)).toEqual(['explode.storeys', 'explode.radial', 'help.guide']);
    recordUse('explode.radial');
    const after = paletteSections(all, loadUsage(), '0.25.0').find((x) => x.id === 'new')!;
    expect(after.commands.map((c) => c.id)).toEqual(['explode.storeys', 'help.guide']); // tried: no longer new
  });

  it('migrates the older recent-commands list', () => {
    localStorage.setItem('shanku.recentCommands', JSON.stringify(['view.edges', 'view.home']));
    const u = loadUsage();
    expect(Object.keys(u)).toEqual(['view.edges', 'view.home']);
    expect(u['view.edges'].last).toBeGreaterThan(u['view.home'].last); // order kept
  });

  it('commands that no longer exist are skipped; disabled new ones are not advertised', () => {
    recordUse('gone.command');
    expect(paletteSections(all, loadUsage(), '0.28.2').flatMap((s) => s.commands).some((c) => c.id === 'gone.command')).toBe(false);
    const withDisabled = all.map((c) => (c.id === 'window.qa' ? { ...c, enabled: false } : c));
    const fresh = paletteSections(withDisabled, {}, '0.28.2').find((s) => s.id === 'new')!;
    expect(fresh.commands.some((c) => c.id === 'window.qa')).toBe(false); // disabled: not advertised
  });
});
