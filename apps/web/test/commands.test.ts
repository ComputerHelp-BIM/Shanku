import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadUsage, rankCommands, recordUse, scoreCommand, sequenceKeys, type AppCommand } from '../src/lib/commands';
import { GUIDE, searchGuide } from '../src/lib/guide';

const noop = () => undefined;
const cmd = (id: string, title: string, extra: Partial<AppCommand> = {}): AppCommand => ({ id, title, group: 'View', run: noop, ...extra });

const COMMANDS: AppCommand[] = [
  cmd('view.fit', 'Zoom to fit', { keys: 'ZF · ZE · ZX · ZA' }),
  cmd('visibility.isolateElement', 'Isolate elements', { group: 'Visibility', keys: 'HI' }),
  cmd('visibility.isolateCategory', 'Isolate category', { group: 'Visibility', keys: 'IC' }),
  cmd('visibility.vg', 'Visibility/Graphics…', { group: 'Visibility', keys: 'VG · VV', keywords: 'colour transparency halftone' }),
  cmd('view.hiddenLine', 'Visual style: Hidden line', { keys: 'HL' }),
  cmd('explode.storeys', 'Explode: storeys', { group: 'Explode', enabled: false, why: 'works in 3D views' }),
  cmd('help.guide', 'Guide & FAQ', { group: 'Help', keys: 'F1', keywords: 'help manual' }),
];
const ids = (q: string) => rankCommands(COMMANDS, q).map((c) => c.id);

describe('command palette ranking', () => {
  it('puts an exact shortcut first', () => {
    expect(ids('zf')[0]).toBe('view.fit');
    expect(ids('HL')[0]).toBe('view.hiddenLine');
  });

  it('prefers a title prefix, then word prefixes, then substrings', () => {
    expect(ids('isolate')).toEqual(['visibility.isolateElement', 'visibility.isolateCategory']);
    expect(ids('hidden')[0]).toBe('view.hiddenLine');
    expect(ids('iso cat')[0]).toBe('visibility.isolateCategory');
  });

  it('matches keywords and letters in order', () => {
    expect(ids('halftone')).toEqual(['visibility.vg']);
    expect(ids('help')).toEqual(['help.guide']);
    expect(scoreCommand(COMMANDS[0], 'ztf')).toBeGreaterThan(0); // Z-oom T-o F-it
    expect(scoreCommand(COMMANDS[0], 'xyz')).toBe(0);
  });

  it('keeps registry order within a tier, so related commands stay together', () => {
    const modes = [cmd('explode.storeys', 'Explode: storeys'), cmd('explode.radial', 'Explode: radial'), cmd('explode.categories', 'Explode: categories')];
    expect(rankCommands(modes, 'explode').map((c) => c.id)).toEqual(['explode.storeys', 'explode.radial', 'explode.categories']);
  });

  it('keeps disabled commands, but after enabled ones', () => {
    const all = rankCommands([cmd('a', 'Explode: storeys', { enabled: false }), cmd('b', 'Explode: radial')], 'explode');
    expect(all.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('returns everything for an empty query and respects the limit', () => {
    expect(rankCommands(COMMANDS, '')).toHaveLength(COMMANDS.length);
    expect(rankCommands(COMMANDS, '', 3)).toHaveLength(3);
  });

  it('lists every two-letter sequence for a legacy command', () => {
    expect(sequenceKeys('fit')).toBe('ZF · ZE · ZX · ZA');
    expect(sequenceKeys('sectionBox')).toBe('BX');
  });
});

describe('recent commands', () => {
  // The web tests run in Node: give them an in-memory localStorage.
  beforeEach(() => {
    const data = new Map<string, string>();
    (globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'clear'> }).localStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, String(v)),
      clear: () => data.clear(),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  it('works without storage at all', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(Object.keys(recordUse('a'))).toEqual(['a']);
    expect(loadUsage()).toEqual({});
  });
  it('counts runs and keeps the last time, newest first', () => {
    let t = 0;
    for (const id of ['a', 'b', 'a']) recordUse(id, (t += 10));
    const u = loadUsage();
    expect(u.a).toEqual({ count: 2, last: 30 });
    expect(u.b).toEqual({ count: 1, last: 20 });
  });
  it('survives unreadable storage', () => {
    localStorage.setItem('shanku.commandUsage', '{not json');
    expect(loadUsage()).toEqual({});
  });
});

describe('guide', () => {
  it('has unique section ids in the three groups, each with content', () => {
    expect(new Set(GUIDE.map((s) => s.id)).size).toBe(GUIDE.length);
    for (const s of GUIDE) {
      expect(['Guide', 'Answers', 'About']).toContain(s.group);
      expect(s.blocks.length).toBeGreaterThan(0);
    }
  });

  it('searches titles, text, FAQ answers and shortcuts, all words required', () => {
    expect(searchGuide('').length).toBe(GUIDE.length);
    expect(searchGuide('explode').map((s) => s.id)).toContain('explode');
    expect(searchGuide('rvt').map((s) => s.id)).toEqual(expect.arrayContaining(['what', 'faq']));
    expect(searchGuide('ZF').map((s) => s.id)).toContain('keys');
    expect(searchGuide('section box grips nonexistentword')).toEqual([]);
  });
});
