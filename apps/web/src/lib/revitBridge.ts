/**
 * Client for the Shanku Revit bridge (docs/bridge/protocol.md): the add-in in Revit serves a small
 * API on localhost; this finds it, pairs with a one-time code, loads the model and keeps the
 * selection in step both ways.
 *
 * It never contacts localhost on its own: only after the user opens the Revit window or when this
 * browser paired before (Chrome asks once for local network access).
 */

import type { RevitElementParams } from './paramEdits';

export type BridgePhase =
  | 'idle' // not tried (the user has not asked)
  | 'searching'
  | 'absent' // no add-in answered
  | 'unpaired' // add-in found; needs the code
  | 'connected'
  | 'error';

export interface RevitDocument {
  title: string;
  key: string;
  path: string;
  isFamily: boolean;
}

export interface BridgeState {
  phase: BridgePhase;
  port: number;
  addin?: string;
  revit?: string;
  /** The model open in Revit (null: none). */
  document?: RevitDocument | null;
  /** What the add-in can do beyond the basics, e.g. "params" (add-in 0.2.0). */
  features?: string[];
  error?: string;
}

export interface RevitSelection {
  key: string;
  globalIds: string[];
  elementIds: number[];
}

/** Elements Revit changed (by anyone, including Shanku's Apply), by GlobalId. */
export interface RevitChanges {
  key: string;
  modified: string[];
  added: string[];
  deleted: string[];
}

export const DEFAULT_PORT = 7071;
const STORE = 'shanku.revitBridge';
const PROTOCOL = 1;

interface Stored {
  port: number;
  token?: string;
}

type EventSourceLike = Pick<EventSource, 'addEventListener' | 'close'> & { onerror: ((e: Event) => void) | null };

export interface BridgeDeps {
  fetch: typeof fetch;
  EventSource: new (url: string) => EventSourceLike;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

const browserDeps = (): BridgeDeps => ({
  fetch: (...a) => fetch(...a),
  // read from globalThis: absent outside browsers (tests pass their own)
  EventSource: (globalThis as { EventSource?: unknown }).EventSource as BridgeDeps['EventSource'],
  storage: (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
});

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class RevitBridge {
  private state: BridgeState;
  private readonly listeners = new Set<(s: BridgeState) => void>();
  private readonly selectionListeners = new Set<(s: RevitSelection) => void>();
  private readonly changeListeners = new Set<(c: RevitChanges) => void>();
  private events: EventSourceLike | null = null;
  private retry: unknown = null;
  private retryMs = 2000;
  private stored: Stored;
  private readonly deps: BridgeDeps;

  constructor(deps: Partial<BridgeDeps> = {}) {
    this.deps = { ...browserDeps(), ...deps };
    this.stored = this.load();
    this.state = { phase: 'idle', port: this.stored.port };
  }

  // ---------------------------------------------------------------- state

  getState = (): BridgeState => this.state;

  subscribe = (fn: (s: BridgeState) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  onSelection(fn: (s: RevitSelection) => void): () => void {
    this.selectionListeners.add(fn);
    return () => this.selectionListeners.delete(fn);
  }

  /** Revit changed elements (add-in 0.5.0+). */
  onChanges(fn: (c: RevitChanges) => void): () => void {
    this.changeListeners.add(fn);
    return () => this.changeListeners.delete(fn);
  }

  /** The add-in sends changes and exports only changed elements (Shanku Bridge for Revit 0.5.0+). */
  get canLiveUpdate(): boolean {
    return !!this.state.features?.includes('changes') && !!this.state.features?.includes('partial-export');
  }

  /** This browser paired before, so reconnecting needs no code (and no new permission prompt). */
  get hasToken(): boolean {
    return !!this.stored.token;
  }

  private set(patch: Partial<BridgeState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private get base(): string {
    return `http://localhost:${this.state.port}/shanku/v1`;
  }

  // ---------------------------------------------------------------- calls

  private async call<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<Response & { json(): Promise<T> }> {
    const ctrl = new AbortController();
    const timer = this.deps.setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
      if (this.stored.token) headers.Authorization = `Bearer ${this.stored.token}`;
      if (init.body) headers['Content-Type'] = 'application/json';
      const res = await this.deps.fetch(this.base + path, { ...init, headers, signal: ctrl.signal });
      if (!res.ok) {
        let msg = `Revit answered ${res.status}.`;
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {
          /* not JSON */
        }
        throw new BridgeError(msg, res.status);
      }
      return res;
    } catch (e) {
      if (e instanceof BridgeError) throw e;
      if ((e as Error)?.name === 'AbortError') throw new BridgeError('Revit did not answer in time. Close any open dialog in Revit and try again.', 504);
      throw new BridgeError('Revit is not reachable.', 0);
    } finally {
      this.deps.clearTimeout(timer);
    }
  }

  /**
   * Looks for the add-in; with a stored token, connects. Call when the user asks (or on start when
   * paired before).
   */
  async connect(port = this.state.port): Promise<BridgeState> {
    if (port !== this.state.port) {
      this.state = { ...this.state, port };
      this.stored.port = port;
      this.save();
    }
    this.set({ phase: 'searching', error: undefined });
    let hello: { service: string; protocol: number; addin: string; revit: string; features?: string[] };
    try {
      hello = await (await this.call<typeof hello>('/hello', {}, 5000)).json();
    } catch {
      this.set({ phase: 'absent', error: undefined });
      this.scheduleRetry();
      return this.state;
    }
    if (hello.service !== 'shanku-revit') {
      this.set({ phase: 'error', error: `Something else is using port ${port}.` });
      return this.state;
    }
    if (hello.protocol !== PROTOCOL) {
      this.set({ phase: 'error', addin: hello.addin, revit: hello.revit, error: `This Revit add-in speaks protocol ${hello.protocol}; Shanku speaks ${PROTOCOL}. Update ${hello.protocol < PROTOCOL ? 'the add-in' : 'Shanku (reload the page)'}.` });
      return this.state;
    }
    this.set({ addin: hello.addin, revit: hello.revit, features: hello.features ?? [] });
    if (!this.stored.token) {
      this.set({ phase: 'unpaired' });
      return this.state;
    }
    try {
      const status = await (await this.call<{ document: RevitDocument | null }>('/status', {}, 60_000)).json();
      this.set({ phase: 'connected', document: status.document, error: undefined });
      this.retryMs = 2000;
      this.openEvents();
    } catch (e) {
      if (e instanceof BridgeError && e.status === 401) {
        this.forgetToken();
        this.set({ phase: 'unpaired', error: 'Revit no longer knows this browser (Disconnect was used). Enter a new code.' });
      } else this.set({ phase: 'error', error: (e as Error).message });
    }
    return this.state;
  }

  /** Exchanges the code shown in Revit (Shanku → Connect) for a token, then connects. */
  async pair(code: string): Promise<BridgeState> {
    const clean = code.replace(/\D/g, '');
    if (clean.length !== 6) {
      this.set({ error: 'The code has 6 digits.' });
      return this.state;
    }
    try {
      const { token } = await (await this.call<{ token: string }>('/pair', { method: 'POST', body: JSON.stringify({ code: clean, client: 'Shanku web' }) })).json();
      this.stored.token = token;
      this.save();
    } catch (e) {
      this.set({ error: (e as Error).message });
      return this.state;
    }
    return this.connect();
  }

  /** Revit exports the open model (IFC4 RV); resolves with the file. Waits up to 10 minutes. */
  async loadModel(): Promise<{ name: string; bytes: ArrayBuffer; key: string; title: string }> {
    const res = await this.call<never>('/model/export', { method: 'POST' }, 600_000);
    const key = res.headers.get('X-Shanku-Document-Key') ?? '';
    const title = decodeURIComponent(res.headers.get('X-Shanku-Document-Title') ?? 'Revit model');
    const bytes = await res.arrayBuffer();
    return { name: `${title}.ifc`, bytes, key, title };
  }

  /** Revit exports only these elements (a live update), with the same options as the full model. */
  async exportElements(globalIds: string[]): Promise<{ bytes: ArrayBuffer; key: string }> {
    const res = await this.call<never>('/model/export', { method: 'POST', body: JSON.stringify({ globalIds }) }, 600_000);
    return { bytes: await res.arrayBuffer(), key: res.headers.get('X-Shanku-Document-Key') ?? '' };
  }

  /** Selects these elements in Revit (GlobalIds first, ElementIds as a fallback). */
  async select(key: string, globalIds: string[], elementIds: number[]): Promise<{ selected: number; missing: number }> {
    return (await this.call<{ selected: number; missing: number }>('/selection', { method: 'POST', body: JSON.stringify({ key, globalIds, elementIds }) })).json();
  }

  /** The add-in can read and write parameters (Shanku Bridge for Revit 0.2.0+). */
  get canEditParams(): boolean {
    return !!this.state.features?.includes('params');
  }

  /** Instance parameters of these elements, as Revit has them now (up to 500 elements). */
  async readParams(key: string, globalIds: string[]): Promise<RevitElementParams[]> {
    return (await (await this.call<{ elements: RevitElementParams[] }>('/params/read', { method: 'POST', body: JSON.stringify({ key, globalIds }) }, 120_000)).json()).elements;
  }

  /** Applies (or, with dryRun, only checks) parameter changes in one Revit transaction. */
  async writeParams(
    key: string,
    changes: Array<{ globalId: string; paramId: number; name: string; oldDisplay: string | null; value: string }>,
    dryRun: boolean,
  ): Promise<{ dryRun: boolean; undoName: string; results: Array<{ index: number; ok: boolean; error?: string | null; newDisplay?: string | null }>; warnings: string[] }> {
    return (await this.call<never>('/params/write', { method: 'POST', body: JSON.stringify({ key, dryRun, changes }) }, 600_000)).json();
  }

  /** What is selected in Revit right now (GlobalIds), for "Get from Revit". */
  async revitSelection(): Promise<{ key: string | null; globalIds: string[] }> {
    const st = await (await this.call<{ document: RevitDocument | null; selection: string[] }>('/status', {}, 60_000)).json();
    return { key: st.document?.key ?? null, globalIds: st.selection ?? [] };
  }

  /** Forgets this browser's pairing (Revit keeps other browsers until Disconnect in Revit). */
  disconnect(): void {
    this.closeEvents();
    this.forgetToken();
    this.set({ phase: 'unpaired', document: undefined });
  }

  /** Stops talking to Revit (on unmount). */
  dispose(): void {
    this.closeEvents();
    if (this.retry) this.deps.clearTimeout(this.retry);
    this.retry = null;
  }

  // ---------------------------------------------------------------- events

  private openEvents(): void {
    this.closeEvents();
    const es = new this.deps.EventSource(`${this.base}/events?token=${encodeURIComponent(this.stored.token ?? '')}`);
    es.addEventListener('document', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { document: RevitDocument | null };
      this.set({ document: d.document });
    });
    es.addEventListener('selection', (e) => {
      const s = JSON.parse((e as MessageEvent).data) as RevitSelection;
      for (const fn of this.selectionListeners) fn({ key: s.key, globalIds: s.globalIds ?? [], elementIds: s.elementIds ?? [] });
    });
    es.addEventListener('changes', (e) => {
      const c = JSON.parse((e as MessageEvent).data) as RevitChanges;
      for (const fn of this.changeListeners) fn({ key: c.key, modified: c.modified ?? [], added: c.added ?? [], deleted: c.deleted ?? [] });
    });
    es.onerror = () => {
      // Revit closed or restarted: look again, with backoff
      this.closeEvents();
      this.set({ phase: 'searching' });
      this.scheduleRetry(true);
    };
    this.events = es;
  }

  private closeEvents(): void {
    this.events?.close();
    this.events = null;
  }

  private scheduleRetry(immediate = false): void {
    if (this.retry) this.deps.clearTimeout(this.retry);
    // Only keep looking when this browser paired before; a first-time user retries by hand.
    if (!this.stored.token) return;
    const wait = immediate ? 1000 : this.retryMs;
    this.retryMs = Math.min(30_000, this.retryMs * 2);
    this.retry = this.deps.setTimeout(() => {
      this.retry = null;
      void this.connect();
    }, wait);
  }

  // ---------------------------------------------------------------- storage

  private load(): Stored {
    try {
      const v = JSON.parse(this.deps.storage?.getItem(STORE) ?? 'null');
      if (v && typeof v.port === 'number') return { port: v.port, token: typeof v.token === 'string' ? v.token : undefined };
    } catch {
      /* unreadable: defaults */
    }
    return { port: DEFAULT_PORT };
  }

  private save(): void {
    try {
      this.deps.storage?.setItem(STORE, JSON.stringify(this.stored));
    } catch {
      /* storage unavailable: pair again next time */
    }
  }

  private forgetToken(): void {
    this.stored.token = undefined;
    this.save();
  }
}

/**
 * Element indices for a Revit selection: by GlobalId, then by ElementId (the IFC Tag Revit writes)
 * for elements whose GlobalId differs.
 */
export function indicesForRevitSelection(
  elements: ReadonlyArray<{ globalId: string; tag: string }>,
  globalIds: readonly string[],
  elementIds: readonly number[],
): number[] {
  const byGid = new Map<string, number>();
  const byTag = new Map<string, number>();
  elements.forEach((e, i) => {
    byGid.set(e.globalId, i);
    if (e.tag) byTag.set(e.tag, i);
  });
  const out = new Set<number>();
  globalIds.forEach((g, k) => {
    const i = byGid.get(g) ?? (elementIds[k] ? byTag.get(String(elementIds[k])) : undefined);
    if (i !== undefined) out.add(i);
  });
  return [...out];
}
