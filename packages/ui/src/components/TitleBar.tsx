import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { OPEN_COMMAND_PALETTE, formatShortcut, useShortcut } from '../hooks/useShortcut';
import { ShankuMark } from './ShankuMark';

export interface CommandSearchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Focus on Ctrl + K / Cmd + K. Default true. */
  bindShortcut?: boolean;
}

/** The title-bar search for commands, elements and IDs. */
export const CommandSearch = forwardRef<HTMLInputElement, CommandSearchProps>(function CommandSearch(
  { bindShortcut = true, placeholder, className, ...rest },
  ref,
) {
  const inner = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  useShortcut(OPEN_COMMAND_PALETTE, () => inner.current?.focus(), { enabled: bindShortcut, allowInEditable: true });
  return (
    <input
      ref={inner}
      type="search"
      aria-label="Search commands, elements and IDs"
      placeholder={placeholder ?? `Search commands, elements, IDs…   ${formatShortcut(OPEN_COMMAND_PALETTE)}`}
      className={['sk-command-search', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
});

export interface TitleBarProps {
  fileName: string;
  /** e.g. "Saved locally", "Unsaved changes". */
  saveState?: string;
  search?: ReactNode;
  actions?: ReactNode;
}

export function TitleBar({ fileName, saveState, search, actions }: TitleBarProps) {
  return (
    <header className="sk-titlebar">
      <div className="sk-titlebar__brand">
        <ShankuMark size={26} />
        <span className="sk-titlebar__wordmark">shanku</span>
      </div>
      <span className="sk-titlebar__divider" aria-hidden="true" />
      <span className="sk-titlebar__file">{fileName}</span>
      {saveState ? <span className="sk-titlebar__save">{saveState}</span> : null}
      <div className="sk-titlebar__search">{search}</div>
      <div className="sk-titlebar__actions">{actions}</div>
    </header>
  );
}
