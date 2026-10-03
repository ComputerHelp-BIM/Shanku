import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@cad2bim/ui';
import type { Diagnosis } from '../lib/fileDiagnosis';
import { decodeViewToken, type ViewToken } from '../lib/viewLink';
import { RETENTION_LABEL, type MyShare, type Retention, type ShareInfo } from '../lib/sharedModel';

/** A modal <dialog> that opens and closes with `open` (Esc and the Close button call onClose). */
function Modal({ open, onClose, label, children, wide }: { open: boolean; onClose: () => void; label: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={['app-dialog', wide && 'app-dialog--wide'].filter(Boolean).join(' ')} aria-label={label} onClose={onClose}>
      {open ? children : null}
    </dialog>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * When a file does not open (Structura item 13): what the file really is, the export steps that give
 * cad2bim a file it can read, and a "What is in this file?" report to copy. Nothing is uploaded.
 */
export function FileDiagnosisDialog({ diagnosis, onClose, onChooseAnother }: { diagnosis: Diagnosis | null; onClose: () => void; onChooseAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [diagnosis]);
  return (
    <Modal open={!!diagnosis} onClose={onClose} label="Why the file did not open" wide>
      {diagnosis ? (
        <>
          <h2 className="app-dialog__title">{diagnosis.title}</h2>
          <p className="app-dialog__text">
            cad2bim looked at the file on this device. Detected: <strong>{diagnosis.format}</strong>.
          </p>
          <ol className="app-diag__steps">
            {diagnosis.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <details className="app-diag__report">
            <summary>What is in this file?</summary>
            <pre tabIndex={0} aria-label="File report">{diagnosis.report}</pre>
            <Button
              size="sm"
              onClick={async () => setCopied(await copyText(diagnosis.report))}
            >
              {copied ? 'Copied' : 'Copy report'}
            </Button>
            <span className="app-faint"> The report has no model data, only the file name, size and header.</span>
          </details>
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={onChooseAnother}>
              Choose another file
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * Share a view (Structura item 14): shows the link to copy, or takes a pasted link or
 * `SHANKU/1|…` text and applies it to the open model.
 */
/** Sharing the model with the link (opt-in): what the dialog needs from the app. */
export interface ModelShareProps {
  /** Why the open model cannot be shared now, or null. */
  why: string | null;
  info: ShareInfo | null;
  mine: MyShare[];
  onShare: (retention: Retention, teamCode: string) => Promise<string>;
  onDelete: (s: MyShare) => Promise<void>;
}

export function ViewLinkDialog({ mode, link, onApply, onClose, share }: { mode: 'copy' | 'open' | null; link: string; onApply: (t: ViewToken) => void; onClose: () => void; share?: ModelShareProps }) {
  const [text, setText] = useState('');
  const [copied, setCopied] = useState(false);
  const token = text.trim() ? decodeViewToken(text) : null;
  useEffect(() => {
    setText('');
    setCopied(false);
  }, [mode]);
  return (
    <Modal open={mode !== null} onClose={onClose} label={mode === 'copy' ? 'View link' : 'Open a view link'}>
      {mode === 'copy' ? (
        <>
          <h2 className="app-dialog__title">View link</h2>
          <p className="app-dialog__text">
            The link holds this view (camera, section box, style, selection and what is hidden), not the model: models stay on each device and are never uploaded. Whoever opens it is asked for the
            same file and sees this view once it is open. Links to the sample buildings open the sample by themselves.
          </p>
          <textarea className="app-link-box" readOnly value={link} rows={4} aria-label="View link" onFocus={(e) => e.currentTarget.select()} />
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={async () => setCopied(await copyText(link))}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          {share ? <ShareModelSection {...share} /> : null}
        </>
      ) : mode === 'open' ? (
        <>
          <h2 className="app-dialog__title">Open a view link</h2>
          <p className="app-dialog__text">Paste a cad2bim view link, or text starting with SHANKU/1|. It applies to the model that is open.</p>
          <textarea className="app-link-box" value={text} rows={4} autoFocus aria-label="View link to open" aria-invalid={text.trim() !== '' && !token} onChange={(e) => setText(e.target.value)} />
          <p className="app-dialog__text" role="status">
            {!text.trim() ? '' : token ? `A view of ${token.file}${token.select?.length ? `, ${token.select.length} selected` : ''}${token.hide ? `, ${token.hide.mode === 'isolate' ? 'isolated' : 'with hidden'} elements` : ''}.` : 'That is not a cad2bim view link.'}
          </p>
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!token} onClick={() => token && onApply(token)}>
              Show this view
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * Proposed marks before they become changes for Revit (QA "Fix in Revit"): every element and the mark
 * it will get. Nothing reaches Revit until the Changes window is checked and applied.
 */
export function ProposedMarksDialog({ rows, busy, onConfirm, onClose }: { rows: Array<{ label: string; level: string; mark: string }> | null; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={!!rows} onClose={onClose} label="Proposed marks" wide>
      {rows ? (
        <>
          <h2 className="app-dialog__title">Proposed marks</h2>
          <p className="app-dialog__text">
            {rows.length} {rows.length === 1 ? 'element gets' : 'elements get'} a mark that continues the model&rsquo;s numbering, lowest level first. They go to Changes for Revit, where you check and apply them as one Revit undo.
          </p>
          <div className="app-marks">
            <table>
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Level</th>
                  <th>New mark</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.label}</td>
                    <td>{r.level || '—'}</td>
                    <td className="app-marks__new">{r.mark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={busy} onClick={onConfirm}>
              {busy ? 'Reading Revit…' : 'Add to changes for Revit'}
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/** Select by marks (quick-wins B2), for when pasting on the canvas is not convenient. */
export function SelectMarksDialog({ open, onSelect, onClose }: { open: boolean; onSelect: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} label="Select by marks">
      {open ? (
        <>
          <h2 className="app-dialog__title">Select by marks</h2>
          <p className="app-dialog__text">Paste marks from WhatsApp, email or Excel: C1, C4, B12, one per line, or ranges like C1-C5. Tip: Ctrl + V on the model does the same.</p>
          <textarea className="app-link-box" rows={5} autoFocus value={text} aria-label="Marks" onChange={(e) => setText(e.target.value)} />
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => onSelect(text)}>
              Select
            </Button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}

/**
 * Share with the model (opt-in): the open model is encrypted on this device and uploaded, so the link
 * opens with no file at hand. The key is only in the link; the copy is kept 1 hour, 1 day, 3 days or until
 * deleted; this browser keeps the means to delete it (My shared models).
 */
function ShareModelSection({ why, info, mine, onShare, onDelete }: ModelShareProps) {
  const [retention, setRetention] = useState<Retention>('1d');
  const [team, setTeam] = useState('');
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string } | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const off = why ?? (info && !info.available ? (info.why ?? 'Sharing models is not set up.') : null);
  const when = (t: number | null) => (t === null ? 'until deleted' : `until ${new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`);
  return (
    <section className="app-share-model" aria-label="Share with the model">
      <h3>Share with the model</h3>
      <p className="app-dialog__text">
        For someone without the file: the model is encrypted on this device before upload, and the key is only in the link, so the stored copy is unreadable without it. Anyone with the link can
        open it.
      </p>
      {off ? (
        <p className="app-share-model__off">{off}</p>
      ) : (
        <div className="app-share-model__row">
          <label>
            Keep it
            <select value={retention} onChange={(e) => setRetention(e.target.value as Retention)} aria-label="How long to keep the shared model">
              {(Object.keys(RETENTION_LABEL) as Retention[]).map((r) => (
                <option key={r} value={r}>
                  {RETENTION_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          {info?.teamCode ? <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team code" aria-label="Team code" type="password" /> : null}
          <Button
            variant="primary"
            disabled={!!state?.busy}
            onClick={async () => {
              setState({ busy: true });
              try {
                const url = await onShare(retention, team);
                const copied = await copyText(url);
                setState({ done: copied ? 'Link with the model copied.' : 'Shared; copy the link from My shared models.' });
              } catch (e) {
                setState({ error: (e as Error).message });
              }
            }}
          >
            {state?.busy ? 'Encrypting and uploading…' : 'Upload and copy link'}
          </Button>
        </div>
      )}
      {state?.error ? <p className="app-share-model__error" role="alert">{state.error}</p> : state?.done ? <p className="app-share-model__done" role="status">{state.done}</p> : null}
      {mine.filter((s) => !gone.includes(s.id)).length ? (
        <details className="app-share-model__mine" open={!!state?.done}>
          <summary>My shared models ({mine.filter((s) => !gone.includes(s.id)).length})</summary>
          <ul>
            {mine
              .filter((s) => !gone.includes(s.id))
              .map((s) => (
                <li key={s.id}>
                  <span>
                    {s.file} <em>{when(s.expiresAt)}</em>
                  </span>
                  <Button size="sm" onClick={async () => void (await copyText(s.link))}>
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    onClick={async () => {
                      try {
                        await onDelete(s);
                        setGone((g) => [...g, s.id]);
                      } catch (e) {
                        setState({ error: (e as Error).message });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

