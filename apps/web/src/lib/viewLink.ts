/**
 * Shareable view links (from the Structura viewer's view-state token). A link holds the view, the
 * camera, the section box, the visual style, the selection and what is hidden, never the model: the
 * person who opens it needs the same file, and elements are matched by IFC GlobalId, so a re-export
 * of the same model still works.
 *
 * Text form: `SHANKU/1|<base64url JSON>`. Link form: `<app url>#app&view=<base64url JSON>` (#app opens the
 * app straight away, skipping the homepage).
 */
export const VIEW_TOKEN_PREFIX = 'SHANKU/1|';
/** Most element ids a link carries for the selection and for what is hidden, each. */
export const MAX_LINK_IDS = 500;

export interface ViewToken {
  v: 1;
  /** File name the view was made on, to tell the reader which model to open. */
  file: string;
  /** Model view id ('3d', a plan, a section…). */
  view?: string;
  /** Camera: position xyz, target xyz, zoom, frame height, quaternion xyzw. */
  camera?: number[];
  /** Section box: centre xyz, half size xyz, angle (radians). */
  box?: number[];
  style?: string;
  /** Selected elements by GlobalId. */
  select?: string[];
  /** Hidden elements: the ids hidden, or (isolate) the only ids shown. */
  hide?: { mode: 'isolate' | 'hide'; ids: string[] };
  explode?: { modes: string[]; amount: number };
  /** True when a list was cut to MAX_LINK_IDS. */
  partial?: boolean;
}

const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Keeps the smaller of "hidden" and "shown", so isolating 3 of 50,000 elements stays a short link. */
export function hiddenForLink(hidden: readonly string[], shown: readonly string[]): ViewToken['hide'] | undefined {
  if (!hidden.length) return undefined;
  return shown.length < hidden.length ? { mode: 'isolate', ids: [...shown] } : { mode: 'hide', ids: [...hidden] };
}

/** Cuts id lists to MAX_LINK_IDS and marks the token partial when it had to. */
export function limitToken(t: ViewToken): ViewToken {
  let partial = t.partial ?? false;
  const cut = (ids: string[]) => {
    if (ids.length <= MAX_LINK_IDS) return ids;
    partial = true;
    return ids.slice(0, MAX_LINK_IDS);
  };
  const out: ViewToken = { ...t };
  if (t.select) out.select = cut(t.select);
  // An isolation cut short would hide what should show, so it is dropped instead of cut.
  if (t.hide) {
    if (t.hide.mode === 'isolate' && t.hide.ids.length > MAX_LINK_IDS) {
      delete out.hide;
      partial = true;
    } else out.hide = { mode: t.hide.mode, ids: cut(t.hide.ids) };
  }
  if (partial) out.partial = true;
  return out;
}

export function encodeViewToken(t: ViewToken): string {
  return VIEW_TOKEN_PREFIX + b64url(JSON.stringify(limitToken(t)));
}

export function viewLinkUrl(base: string, t: ViewToken): string {
  return `${base.split('#')[0]}#app&view=${encodeViewToken(t).slice(VIEW_TOKEN_PREFIX.length)}`;
}

const isNums = (v: unknown, n: number) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && Number.isFinite(x));
const isStrs = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Reads a token from a pasted link, a `#view=` hash or `SHANKU/1|…` text. Returns null for anything
 * else, and drops any field that is not well formed (a link is untrusted input).
 */
export function decodeViewToken(input: string): ViewToken | null {
  const s = input.trim();
  let body: string | null = null;
  if (s.startsWith(VIEW_TOKEN_PREFIX)) body = s.slice(VIEW_TOKEN_PREFIX.length);
  else {
    const m = /[#&]view=([A-Za-z0-9_-]+)/.exec(s);
    if (m) body = m[1];
  }
  if (!body || !/^[A-Za-z0-9_-]+$/.test(body)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(unb64url(body));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.file !== 'string') return null;
  const t: ViewToken = { v: 1, file: r.file.slice(0, 260) };
  if (typeof r.view === 'string') t.view = r.view.slice(0, 200);
  if (isNums(r.camera, 12)) t.camera = r.camera as number[];
  if (isNums(r.box, 7)) t.box = r.box as number[];
  if (typeof r.style === 'string') t.style = r.style;
  if (isStrs(r.select)) t.select = (r.select as string[]).slice(0, MAX_LINK_IDS);
  const h = r.hide as Record<string, unknown> | undefined;
  if (h && (h.mode === 'isolate' || h.mode === 'hide') && isStrs(h.ids)) t.hide = { mode: h.mode, ids: (h.ids as string[]).slice(0, MAX_LINK_IDS) };
  const x = r.explode as Record<string, unknown> | undefined;
  if (x && isStrs(x.modes) && (x.modes as string[]).length && typeof x.amount === 'number' && Number.isFinite(x.amount)) t.explode = { modes: (x.modes as string[]).slice(0, 8), amount: Math.min(1, Math.max(0, x.amount)) };
  if (r.partial === true) t.partial = true;
  return t;
}
