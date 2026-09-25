import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@shanku/ui';
import type { Diagnosis } from '../lib/fileDiagnosis';
import { decodeViewToken, type ViewToken } from '../lib/viewLink';

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
 * Shanku a file it can read, and a "What is in this file?" report to copy. Nothing is uploaded.
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
            Shanku looked at the file on this device. Detected: <strong>{diagnosis.format}</strong>.
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
export function ViewLinkDialog({ mode, link, onApply, onClose }: { mode: 'copy' | 'open' | null; link: string; onApply: (t: ViewToken) => void; onClose: () => void }) {
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
          <p className="app-dialog__text">Anyone who opens this link and the same model file sees this view: camera, section box, style, selection and what is hidden. The model itself is not in the link.</p>
          <textarea className="app-link-box" readOnly value={link} rows={4} aria-label="View link" onFocus={(e) => e.currentTarget.select()} />
          <div className="app-dialog__actions">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={async () => setCopied(await copyText(link))}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </>
      ) : mode === 'open' ? (
        <>
          <h2 className="app-dialog__title">Open a view link</h2>
          <p className="app-dialog__text">Paste a Shanku view link, or text starting with SHANKU/1|. It applies to the model that is open.</p>
          <textarea className="app-link-box" value={text} rows={4} autoFocus aria-label="View link to open" aria-invalid={text.trim() !== '' && !token} onChange={(e) => setText(e.target.value)} />
          <p className="app-dialog__text" role="status">
            {!text.trim() ? '' : token ? `A view of ${token.file}${token.select?.length ? `, ${token.select.length} selected` : ''}${token.hide ? `, ${token.hide.mode === 'isolate' ? 'isolated' : 'with hidden'} elements` : ''}.` : 'That is not a Shanku view link.'}
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
