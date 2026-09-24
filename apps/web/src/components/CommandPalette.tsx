import { Fragment, useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { CommandSearch } from '@shanku/ui';
import { isNewCommand, loadUsage, paletteSections, rankCommands, recordUse, type AppCommand, type CommandUsage } from '../lib/commands';

/** An element the query found (mark, Element ID, GlobalId or name). */
export interface ElementHit {
  label: string;
  detail?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  /** Built on demand, so commands always reflect the current selection, view and model. */
  getCommands: () => AppCommand[];
  findElement: (query: string) => ElementHit | null;
  inputRef?: Ref<HTMLInputElement>;
  /** For the "New in Shanku x.y" section and the New badges. */
  appVersion: string;
}

/** A row, and the section heading drawn above it when it starts a section (empty query only). */
type Row = ({ kind: 'element'; hit: ElementHit } | { kind: 'command'; cmd: AppCommand }) & { heading?: string };

/**
 * The title-bar search (Ctrl + K) as a command palette: type a command name ("isolate",
 * "hidden line", "vg") or a mark, Element ID, GlobalId or name. A leading ">" searches commands only.
 * WAI-ARIA combobox: ↑ ↓ move, Enter runs, Esc clears then closes.
 */
export function CommandPalette({ getCommands, findElement, inputRef, appVersion }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [usage, setUsage] = useState<CommandUsage>(loadUsage);
  const listId = useId();
  const input = useRef<HTMLInputElement | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!open) return [];
    const commands = getCommands();
    const q = query.trim();
    const commandsOnly = q.startsWith('>');
    const cq = commandsOnly ? q.slice(1).trim() : q;
    if (!cq) {
      // Nothing typed: Recently used, Most used, New in this release, as one list with headings.
      return paletteSections(commands, usage, appVersion).flatMap((sct) =>
        sct.commands.map((cmd, i) => ({ kind: 'command' as const, cmd, heading: i === 0 ? sct.title : undefined })),
      );
    }
    const out: Row[] = [];
    const hit = commandsOnly ? null : findElement(cq);
    if (hit) out.push({ kind: 'element', hit });
    for (const cmd of rankCommands(commands, cq)) out.push({ kind: 'command', cmd });
    return out;
    // getCommands and findElement change every render; the list only needs to follow what is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, usage]);

  const close = (blur: boolean) => {
    setOpen(false);
    setQuery('');
    setActive(0);
    if (blur) input.current?.blur();
  };

  const runRow = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === 'command') {
      if (row.cmd.enabled === false) return;
      setUsage(recordUse(row.cmd.id));
      close(true);
      row.cmd.run();
    } else {
      close(true);
      row.hit.run();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      setOpen(true);
      setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runRow(rows[Math.min(active, rows.length - 1)]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (query) {
        setQuery('');
        setActive(0);
      } else close(true);
    }
  };

  const setRefs = (el: HTMLInputElement | null) => {
    input.current = el;
    if (typeof inputRef === 'function') inputRef(el);
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = el;
  };

  const q = query.trim();
  // Open on focus: recent commands, or a hint when there are none yet.
  const showList = open;
  const optionId = (i: number) => `${listId}-opt-${i}`;
  return (
    <div className="app-palette">
      <CommandSearch
        ref={setRefs}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && rows.length ? optionId(Math.min(active, rows.length - 1)) : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => close(false)}
        onKeyDown={onKeyDown}
        placeholder="Search commands, or find by mark, Element ID or name…   Ctrl + K"
      />
      {showList ? (
        <div className="app-palette__list" id={listId} role="listbox" aria-label="Commands and elements">
          {rows.map((row, i) => {
            const isActive = i === Math.min(active, rows.length - 1);
            const disabled = row.kind === 'command' && row.cmd.enabled === false;
            const fresh = row.kind === 'command' && isNewCommand(row.cmd.id, appVersion) && !usage[row.cmd.id];
            return (
              <Fragment key={row.kind === 'command' ? `${row.heading ?? ''}${row.cmd.id}` : 'element'}>
              {row.heading ? (
                <div className="app-palette__heading" role="presentation">
                  {row.heading}
                </div>
              ) : null}
              <div
                id={optionId(i)}
                role="option"
                aria-selected={isActive}
                aria-disabled={disabled || undefined}
                className={['app-palette__row', isActive && 'is-active', disabled && 'is-disabled'].filter(Boolean).join(' ')}
                onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                onMouseMove={() => setActive(i)}
                onClick={() => runRow(row)}
              >
                {row.kind === 'element' ? (
                  <>
                    <span className="app-palette__title">
                      Select and zoom to <strong>{row.hit.label}</strong>
                    </span>
                    <span className="app-palette__group">{row.hit.detail ?? 'Element'}</span>
                  </>
                ) : (
                  <>
                    <span className="app-palette__title">
                      {/* every row keeps the check column, so titles line up */}
                      <span className="app-palette__check" aria-hidden="true">{row.cmd.checked ? '✓' : ''}</span>
                      {row.cmd.title}
                      {row.cmd.checked !== undefined ? <span className="app-sr">{row.cmd.checked ? ' (on)' : ' (off)'}</span> : null}
                      {disabled && row.cmd.why ? <span className="app-palette__why"> · {row.cmd.why}</span> : null}
                    </span>
                    {fresh ? <span className="app-palette__new">New</span> : null}
                    <span className="app-palette__group">{row.cmd.group}</span>
                    {row.cmd.keys ? <kbd>{row.cmd.keys}</kbd> : null}
                  </>
                )}
              </div>
              </Fragment>
            );
          })}
          {q && !rows.length ? <div className="app-palette__empty">No command or element matches “{q}”.</div> : null}
          {!q && !rows.length ? <div className="app-palette__empty">Type a command, such as “isolate” or “hidden line”, or a mark, Element ID or GlobalId.</div> : null}
          <div className="app-palette__foot" aria-hidden="true">
            ↑ ↓ move · Enter run · <kbd>&gt;</kbd> commands only · Esc close
          </div>
        </div>
      ) : null}
    </div>
  );
}
