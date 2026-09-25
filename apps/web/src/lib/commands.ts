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

// ---- Usage (kept on this device): how often and when each command was run ----

const USAGE_KEY = 'shanku.commandUsage';
const OLD_RECENT_KEY = 'shanku.recentCommands'; // before 0.29.0: a plain list of recent ids

export interface CommandUse {
  /** Times run. */
  count: number;
  /** Last run, ms since epoch. */
  last: number;
}
export type CommandUsage = Record<string, CommandUse>;

/** Usage per command id; migrates the older recent-commands list (newest first) on first read. */
export function loadUsage(): CommandUsage {
  try {
    const v = JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null');
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as CommandUsage;
    const old = JSON.parse(localStorage.getItem(OLD_RECENT_KEY) ?? '[]');
    const out: CommandUsage = {};
    if (Array.isArray(old)) old.filter((x) => typeof x === 'string').forEach((id: string, i: number) => (out[id] = { count: 1, last: Date.now() - (i + 1) * 1000 }));
    return out;
  } catch {
    return {};
  }
}

/** Counts one run of a command and returns the updated usage. */
export function recordUse(id: string, now = Date.now()): CommandUsage {
  const u = loadUsage();
  u[id] = { count: (u[id]?.count ?? 0) + 1, last: now };
  // keep the store small: the 200 most recently used commands
  const kept = Object.entries(u).sort((a, b) => b[1].last - a[1].last).slice(0, 200);
  const next = Object.fromEntries(kept);
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: sections just stay empty */
  }
  return next;
}

// ---- New commands ----

/**
 * The version that introduced each command (exact id, or a prefix ending in "."). The palette calls
 * a command new for five minor releases after it arrived, until it is first used.
 */
export const COMMAND_SINCE: Record<string, string> = {
  'bridge.': '0.32.0',
  'window.qa': '0.27.0',
  'explode.': '0.24.0',
  'help.guide': '0.24.0',
  'help.keys': '0.24.0',
  'help.whatsNew': '0.24.0',
  'view.hiddenLines': '0.21.0',
  'views.section': '0.20.0',
  'views.duplicate': '0.20.0',
  'views.templates': '0.19.0',
};

const minorOf = (v: string) => {
  const [a, b] = v.split('.').map(Number);
  return (a || 0) * 1000 + (b || 0);
};

export function commandSince(id: string): string | undefined {
  if (COMMAND_SINCE[id]) return COMMAND_SINCE[id];
  const prefix = Object.keys(COMMAND_SINCE).find((k) => k.endsWith('.') && id.startsWith(k));
  return prefix ? COMMAND_SINCE[prefix] : undefined;
}

/** New in the last `window` minor releases (0.24–0.28 for 0.28.x with the default 5). */
export function isNewCommand(id: string, appVersion: string, window = 5): boolean {
  const since = commandSince(id);
  if (!since) return false;
  const age = minorOf(appVersion) - minorOf(since); // releases since it arrived
  return age >= 0 && age < window; // not before it exists, and only for a few releases
}

export interface PaletteSection {
  id: 'recent' | 'frequent' | 'new';
  title: string;
  commands: AppCommand[];
}

/**
 * What the palette shows before anything is typed: recently used (newest first), most used (run at
 * least twice, not already listed), and new commands not tried yet. Recently used holds `recentMax`
 * (short, so Most used has room); the others up to `max`.
 */
export function paletteSections(commands: readonly AppCommand[], usage: CommandUsage, appVersion: string, max = 5, recentMax = 3): PaletteSection[] {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const used = Object.entries(usage).filter(([id]) => byId.has(id));
  const recent = used.sort((a, b) => b[1].last - a[1].last).slice(0, recentMax).map(([id]) => byId.get(id)!);
  const shown = new Set(recent.map((c) => c.id));
  const frequent = Object.entries(usage)
    .filter(([id, u]) => byId.has(id) && u.count >= 2 && !shown.has(id))
    .sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last)
    .slice(0, max)
    .map(([id]) => byId.get(id)!);
  frequent.forEach((c) => shown.add(c.id));
  const fresh = commands
    .filter((c) => isNewCommand(c.id, appVersion) && !usage[c.id] && !shown.has(c.id) && c.enabled !== false)
    .sort((a, b) => minorOf(commandSince(b.id)!) - minorOf(commandSince(a.id)!))
    .slice(0, max);
  const [maj, min] = appVersion.split('.');
  return [
    { id: 'recent' as const, title: 'Recently used', commands: recent },
    { id: 'frequent' as const, title: 'Most used', commands: frequent },
    { id: 'new' as const, title: `New in Shanku ${maj}.${min}`, commands: fresh },
  ].filter((sct) => sct.commands.length);
}
