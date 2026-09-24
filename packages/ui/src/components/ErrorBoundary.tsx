import { Component, type ErrorInfo, type ReactNode } from 'react';

export interface ErrorBoundaryProps {
  /** Where this boundary sits, for the report (e.g. "Guide & FAQ window"). */
  where: string;
  /** 'inline' fills the window or panel it guards; 'page' replaces the whole app. */
  variant?: 'inline' | 'page';
  /** Extra lines for the copied report (app version, etc.). */
  details?: () => string;
  /** Page variant: extra recovery action, e.g. resetting saved layouts. */
  onReset?: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
  stack: string;
}

/**
 * Keeps one failing part from taking down the whole app. Inline: the window or panel shows what went
 * wrong with Try again and Copy details. Page: a last-resort screen instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? '' });
    console.error(`[Shanku] Error in ${this.props.where}:`, error, info.componentStack);
  }

  private report(): string {
    const e = this.state.error;
    return [
      `Where: ${this.props.where}`,
      `Error: ${e?.name}: ${e?.message}`,
      this.props.details?.() ?? '',
      `Browser: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
      `Time: ${new Date().toISOString()}`,
      '',
      'Stack:',
      e?.stack ?? '',
      '',
      'Components:',
      this.state.stack.trim(),
    ]
      .filter((l) => l !== undefined)
      .join('\n');
  }

  private copy = () => {
    void navigator.clipboard?.writeText(this.report()).catch(() => undefined);
  };

  render(): ReactNode {
    const e = this.state.error;
    if (!e) return this.props.children;
    const page = this.props.variant === 'page';
    return (
      <div className={page ? 'sk-crash sk-crash--page' : 'sk-crash'} role="alert">
        <strong>{page ? 'Shanku hit an error' : `${this.props.where} hit an error`}</strong>
        <p className="sk-crash__msg">{e.message || e.name}</p>
        <p className="sk-crash__hint">
          {page
            ? 'Your files are safe in this browser. Copy the details and send them, then reload.'
            : 'The rest of the app still works. Copy the details and send them, or try again.'}
        </p>
        <div className="sk-crash__actions">
          <button type="button" className="sk-button sk-button--sm" onClick={this.copy}>
            Copy details
          </button>
          {page ? (
            <>
              {this.props.onReset ? (
                <button type="button" className="sk-button sk-button--sm" onClick={this.props.onReset}>
                  Reset panels &amp; windows
                </button>
              ) : null}
              <button type="button" className="sk-button sk-button--sm sk-button--primary" onClick={() => location.reload()}>
                Reload
              </button>
            </>
          ) : (
            <button type="button" className="sk-button sk-button--sm sk-button--primary" onClick={() => this.setState({ error: null, stack: '' })}>
              Try again
            </button>
          )}
        </div>
        <details className="sk-crash__details">
          <summary>Details</summary>
          <pre>{this.report()}</pre>
        </details>
      </div>
    );
  }
}
