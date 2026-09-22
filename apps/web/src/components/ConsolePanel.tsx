import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ParsedModel } from '@shanku/engine';
import { ConsoleClient, type RunResult } from '../console/client';

type Entry = { id: number; code?: string; result?: RunResult; note?: string; tone?: 'error' };

export interface ConsolePanelProps {
  model: ParsedModel | null;
  selection: number[];
  onAction: (a: RunResult['actions'][number]) => void;
}

const fmt = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v));

/** Python console (Pyodide) with the read-only `shanku` API. Enter runs; Shift + Enter adds a line. */
export function ConsolePanel({ model, selection, onAction }: ConsolePanelProps) {
  const client = useRef<ConsoleClient | null>(null);
  const [status, setStatus] = useState<'booting' | 'ready' | 'failed'>('booting');
  const [log, setLog] = useState<Entry[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef<string[]>([]);
  const hIndex = useRef(-1);
  const seq = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const actionRef = useRef(onAction);
  actionRef.current = onAction;

  const push = (e: Omit<Entry, 'id'>) => setLog((l) => [...l.slice(-300), { ...e, id: ++seq.current }]);

  useEffect(() => {
    const c = new ConsoleClient();
    client.current = c;
    c.boot()
      .then(() => {
        setStatus('ready');
        push({ note: 'Python ready. Type shanku.help() for the API. Enter runs, Shift + Enter adds a line, ↑ ↓ history, Ctrl + L clears.' });
      })
      .catch((e) => {
        setStatus('failed');
        push({ note: `Python could not start: ${e instanceof Error ? e.message : String(e)}`, tone: 'error' });
      });
    return () => c.dispose();
  }, []);

  useEffect(() => {
    if (status === 'ready' && client.current) void client.current.setModel(model?.elements ?? [], model?.info ?? null);
  }, [status, model]);
  useEffect(() => {
    if (status === 'ready' && client.current) void client.current.setSelection(selection);
  }, [status, selection]);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [log]);

  const run = async () => {
    const src = code.trim();
    if (!src || !client.current || status !== 'ready') return;
    history.current = [src, ...history.current.filter((h) => h !== src)].slice(0, 100);
    hIndex.current = -1;
    setCode('');
    setBusy(true);
    try {
      const result = await client.current.run(src);
      push({ code: src, result });
      result.actions.forEach((a) => actionRef.current(a));
    } catch (e) {
      push({ code: src, note: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void run();
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLog([]);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !code.includes('\n')) {
      const h = history.current;
      if (!h.length) return;
      e.preventDefault();
      hIndex.current = Math.max(-1, Math.min(h.length - 1, hIndex.current + (e.key === 'ArrowUp' ? 1 : -1)));
      setCode(hIndex.current < 0 ? '' : h[hIndex.current]);
    }
  };

  return (
    <div className="app-console" onClick={() => input.current?.focus()}>
      <div className="app-console__log" role="log" aria-live="polite">
        {status === 'booting' ? <p className="app-console__note">Starting Python (first time about 12 MB, then cached)…</p> : null}
        {log.map((e) => (
          <div key={e.id} className="app-console__entry">
            {e.code ? <pre className="app-console__in">{e.code.split('\n').map((l, i) => `${i ? '... ' : '>>> '}${l}`).join('\n')}</pre> : null}
            {e.note ? <p className={`app-console__note${e.tone === 'error' ? ' is-error' : ''}`}>{e.note}</p> : null}
            {e.result?.stdout ? <pre className="app-console__out">{e.result.stdout}</pre> : null}
            {e.result?.stderr ? <pre className="app-console__out is-error">{e.result.stderr}</pre> : null}
            {e.result?.repr ? <pre className="app-console__out">{e.result.repr}</pre> : null}
            {e.result?.table ? (
              <div className="app-console__table">
                <table>
                  <thead>
                    <tr>{e.result.table.columns.map((c) => <th key={c}>{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {e.result.table.rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === 'number' ? 'n' : undefined}>{fmt(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
                {e.result.table.total > 200 ? <p className="app-console__note">Showing 200 of {e.result.table.total.toLocaleString('en-IN')} rows.</p> : null}
              </div>
            ) : null}
            {e.result?.error ? <pre className="app-console__out is-error">{e.result.error}</pre> : null}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="app-console__prompt">
        <span aria-hidden="true">{busy ? '…' : '>>>'}</span>
        <textarea
          ref={input}
          aria-label="Python input"
          rows={Math.min(8, code.split('\n').length)}
          value={code}
          disabled={status !== 'ready'}
          placeholder={status === 'ready' ? 'shanku.elements(category="Beam").volume' : ''}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKey}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
