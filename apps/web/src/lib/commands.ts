import { SEQUENCES, type CommandId } from './shortcuts';

/**
 * One command registry for the whole app. Ribbon buttons, the right-click menu, two-letter keys
 * and the command palette (Ctrl + K) all describe their actions with this shape, so the palette
 * finds every action by its name and a later macro recorder can replay them (docs/design/python-macros.md).
 */
export interface AppCommand {
  /** Stable id, dotted by group: 'view.fit', 'visibility.isolateElement', 'window.guide'. */
  id: string;
  /** Sentence case, as on the button: "Zoom to fit". */
  title: string;
  group: CommandGroup;
  /** Shortcut shown in the palette: a two-letter sequence ("ZF") or a chord ("Ctrl + Z"). */
  keys?: string;
  /** Extra words the palette matches (synonyms, Revit names). */
  keywords?: string;
  /** False greys the command out in the palette; `why` says what is missing. */
  enabled?: boolean;
  why?: string;
  /** Toggle commands show their state. */
  checked?: boolean;
  run: () => void;
}

export type CommandGroup = 'File' | 'Edit' | 'Select' | 'Visibility' | 'View' | 'Explode' | 'Views' | 'Windows' | 'Manage' | 'Help';

/** Two-letter keys per legacy CommandId, e.g. fit → "ZF · ZE · ZX · ZA". */
export function sequenceKeys(id: CommandId): string | undefined {
  const keys = Object.entries(SEQUENCES)
    .filter(([, c]) => c === id)
    .map(([k]) => k);
  return keys.length ? keys.join(' · ') : undefined;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Score one command against a query (higher is better, 0 means no match): the title beats keywords,
 * a whole-title prefix beats a word prefix, a word prefix beats a substring, and letters in order
 * ("vg", "hdcat") still match as a last resort. A query equal to the shortcut ("zf") ranks first.
 * Within a tier, registry order decides (rankCommands), so related commands keep their natural order.
 */
export function scoreCommand(cmd: AppCommand, query: string): number {
  const q = norm(query);
  if (!q) return 1;
  const title = norm(cmd.title);
  const keys = (cmd.keys ?? '').toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
  if (keys.includes(q.replace(/ /g, ''))) return 1000;
  if (title === q) return 900;
  if (title.startsWith(q)) return 800;
  const words = title.split(' ');
  const parts = q.split(' ');
  if (parts.every((p) => words.some((w) => w.startsWith(p)))) return 600;
  if (title.includes(q)) return 500;
  const extra = norm(`${cmd.group} ${cmd.keywords ?? ''}`);
  if (parts.every((p) => extra.includes(p) || title.includes(p))) return 300;
  // Letters in order (fuzzy), only for short queries without spaces.
  if (!q.includes(' ') && q.length <= 8) {
    let i = 0;
    for (const ch of title.replace(/ /g, '')) if (ch === q[i]) i++;
    if (i === q.length) return 100;
  }
  return 0;
}

/** Commands matching the query, best first; ties keep registry order. Disabled ones sink below enabled. */
export function rankCommands(commands: readonly AppCommand[], query: string, limit = 12): AppCommand[] {
  const usable = (c: AppCommand) => (c.enabled === false ? 0 : 1);
  return commands
    .map((cmd, order) => ({ cmd, order, score: scoreCommand(cmd, query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => usable(b.cmd) - usable(a.cmd) || b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.cmd);
}

const RECENT_KEY = 'shanku.recentCommands';
const RECENT_MAX = 6;

/** Most recently run command ids, newest first (kept on this device). */
export function loadRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberRecent(id: string): string[] {
  const next = [id, ...loadRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: the palette just shows no recent commands */
  }
  return next;
}
