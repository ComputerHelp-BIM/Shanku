import { describe, expect, it } from 'vitest';
import { RevitBridge, indicesForRevitSelection, type BridgeDeps } from '../src/lib/revitBridge';

/** A pretend add-in: routes to handlers, with an in-memory event stream. */
function fakeRevit(opts: { absent?: boolean; protocol?: number; code?: string; revoked?: boolean } = {}) {
  const calls: Array<{ path: string; body?: unknown; auth?: string }> = [];
  const streams: Array<{ listeners: Record<string, (e: { data: string }) => void>; onerror: ((e: Event) => void) | null; closed: boolean }> = [];
  const doc = { title: 'Tower A', key: 'key-a', path: 'C:/a.rvt', isFamily: false };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    ({ ok: status < 400, status, json: async () => body, headers: new Headers(headers), arrayBuffer: async () => new TextEncoder().encode('ISO-10303-21;').buffer }) as unknown as Response;
  const store = new Map<string, string>();
  const timers: Array<() => void> = [];
  const deps: Partial<BridgeDeps> = {
    fetch: (async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname.replace('/shanku/v1', '');
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth });
      if (opts.absent) throw new TypeError('Failed to fetch');
      if (path === '/hello') return json(200, { service: 'shanku-revit', protocol: opts.protocol ?? 1, addin: '0.1.0', revit: '2025' });
      if (path === '/pair') return (JSON.parse(String(init!.body)).code === (opts.code ?? '123456') ? json(200, { token: 't0k' }) : json(403, { error: 'That code is not right.' }));
      if (!auth || opts.revoked) return json(401, { error: 'Not paired.' });
      if (path === '/status') return json(200, { document: doc, selection: [] });
      if (path === '/model/export') return json(200, null, { 'X-Shanku-Document-Key': 'key-a', 'X-Shanku-Document-Title': 'Tower%20A' });
      if (path === '/selection') return json(200, { selected: 2, missing: 0 });
      return json(404, { error: 'Not found' });
    }) as unknown as typeof fetch,
    EventSource: class {
      listeners: Record<string, (e: { data: string }) => void> = {};
      onerror: ((e: Event) => void) | null = null;
      closed = false;
      constructor(readonly url: string) {
        streams.push(this);
      }
      addEventListener(type: string, fn: (e: { data: string }) => void) {
        this.listeners[type] = fn;
      }
      close() {
        this.closed = true;
      }
    } as unknown as BridgeDeps['EventSource'],
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) },
    setTimeout: (fn: () => void) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => undefined,
  };
  return { deps, calls, streams, store, timers, doc };
}

describe('Revit bridge client', () => {
  it('does nothing until asked (no surprise permission prompt)', () => {
    const f = fakeRevit();
    const b = new RevitBridge(f.deps);
    expect(b.getState().phase).toBe('idle');
    expect(f.calls).toEqual([]);
  });

  it('absent when no add-in answers; a first-time user retries by hand', async () => {
    const f = fakeRevit({ absent: true });
    const b = new RevitBridge(f.deps);
    expect((await b.connect()).phase).toBe('absent');
    expect(f.timers.length).toBe(1); // only the request timeout, no background retry loop
  });

  it('pairs with the code, connects, loads and selects', async () => {
    const f = fakeRevit();
    const b = new RevitBridge(f.deps);
    expect((await b.connect()).phase).toBe('unpaired');
    expect((await b.pair('12 34 5')).error).toBe('The code has 6 digits.');
    expect((await b.pair('999999')).error).toBe('That code is not right.');
    const s = await b.pair('123 456');
    expect(s.phase).toBe('connected');
    expect(s.document?.title).toBe('Tower A');
    expect(f.calls.find((c) => c.path === '/status')?.auth).toBe('Bearer t0k');
    expect(JSON.parse(f.store.get('shanku.revitBridge')!).token).toBe('t0k');
    const m = await b.loadModel();
    expect(m).toMatchObject({ name: 'Tower A.ifc', key: 'key-a', title: 'Tower A' });
    expect(await b.select('key-a', ['g1', 'g2'], [1, 2])).toEqual({ selected: 2, missing: 0 });
    expect(f.calls.at(-1)).toMatchObject({ path: '/selection', body: { key: 'key-a', globalIds: ['g1', 'g2'], elementIds: [1, 2] } });
  });

  it('events: selection from Revit, document changes, reconnect when Revit goes away', async () => {
    const f = fakeRevit();
    const b = new RevitBridge(f.deps);
    await b.connect();
    await b.pair('123456');
    const got: unknown[] = [];
    b.onSelection((s) => got.push(s));
    const es = f.streams[0];
    es.listeners.selection({ data: JSON.stringify({ key: 'key-a', globalIds: ['g1'], elementIds: [101] }) });
    expect(got).toEqual([{ key: 'key-a', globalIds: ['g1'], elementIds: [101] }]);
    es.listeners.document({ data: JSON.stringify({ document: null }) });
    expect(b.getState().document).toBeNull();
    es.onerror!(new Event('error'));
    expect(es.closed).toBe(true);
    expect(b.getState().phase).toBe('searching');
    f.timers.at(-1)!(); // the retry
    await new Promise((r) => setTimeout(r, 0));
    expect(b.getState().phase).toBe('connected');
  });

  it('a revoked token asks for a new code; disconnect forgets it', async () => {
    const f = fakeRevit();
    const b = new RevitBridge(f.deps);
    await b.connect();
    await b.pair('123456');
    b.disconnect();
    expect(b.getState().phase).toBe('unpaired');
    expect(b.hasToken).toBe(false);
    const r = fakeRevit({ revoked: true });
    r.store.set('shanku.revitBridge', JSON.stringify({ port: 7071, token: 'old' }));
    const b2 = new RevitBridge(r.deps);
    const s = await b2.connect();
    expect(s.phase).toBe('unpaired');
    expect(s.error).toMatch(/Enter a new code/);
  });

  it('refuses a mismatched protocol with a clear message', async () => {
    const s = await new RevitBridge(fakeRevit({ protocol: 2 }).deps).connect();
    expect(s.phase).toBe('error');
    expect(s.error).toMatch(/protocol 2.*Update Shanku/);
  });
});

describe('matching a Revit selection', () => {
  it('by GlobalId, then by ElementId (IFC Tag)', () => {
    const els = [
      { globalId: 'g1', tag: '101' },
      { globalId: 'g2', tag: '102' },
      { globalId: 'other', tag: '103' },
    ];
    expect(indicesForRevitSelection(els, ['g2', 'unknown', 'g1'], [102, 103, 101])).toEqual([1, 2, 0]);
  });
});
