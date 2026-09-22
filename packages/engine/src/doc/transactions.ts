/**
 * Transactions, modelled on the Revit API: every change to a document runs inside a named
 * transaction that either commits as one undo step or rolls back completely. Groups combine several
 * transactions into one step (Revit's TransactionGroup.Assimilate). Plugins use the same API.
 *
 *   history.run('Move section box', (t) => t.change('box', before, after, apply));
 *
 * A change is a pair of states plus the function that applies a state, so undo and redo are exact
 * and never re-run the original logic.
 */
export interface Change<T = unknown> {
  /** What changed, for diagnostics ("sectionBox", "rate:Column|RCC"). */
  key: string;
  before: T;
  after: T;
  apply: (state: T) => void;
}

export interface CommittedTransaction {
  id: number;
  name: string;
  /** Who started it: 'user', or a plugin id. */
  source: string;
  time: number;
  changes: Change[];
}

export type TransactionStatus = 'started' | 'committed' | 'rolledBack';

export class TransactionError extends Error {}

/** One open transaction. Obtain it from `History.start` or use `History.run`. */
export class Transaction {
  readonly changes: Change[] = [];
  status: TransactionStatus = 'started';
  constructor(
    readonly name: string,
    readonly source: string,
    private owner: History,
  ) {}

  /** Records a change and applies `after` now. Changes to the same key merge (first before, last after). */
  change<T>(key: string, before: T, after: T, apply: (state: T) => void): void {
    if (this.status !== 'started') throw new TransactionError(`Transaction "${this.name}" is ${this.status}.`);
    const prev = this.changes.find((c) => c.key === key) as Change<T> | undefined;
    if (prev) prev.after = after;
    else this.changes.push({ key, before, after, apply } as Change);
    apply(after);
  }

  commit(): void {
    this.owner.finish(this, true);
  }

  rollBack(): void {
    this.owner.finish(this, false);
  }
}

export interface HistoryOptions {
  /** Undo steps kept (Revit keeps a long list; memory bounds it). Default 200. */
  limit?: number;
}

/**
 * The undo/redo history of one document. Only one transaction (or group) may be open at a time,
 * as in Revit. Listeners hear every commit, undo, redo and rollback.
 */
export class History {
  private undoStack: CommittedTransaction[] = [];
  private redoStack: CommittedTransaction[] = [];
  private open: Transaction | null = null;
  private group: { name: string; source: string; parts: Change[][] } | null = null;
  private seq = 0;
  private listeners = new Set<() => void>();
  private limit: number;

  constructor(options: HistoryOptions = {}) {
    this.limit = options.limit ?? 200;
  }

  /** Starts a transaction; call commit() or rollBack() on it. */
  start(name: string, source = 'user'): Transaction {
    if (this.open) throw new TransactionError(`"${this.open.name}" is still open; commit or roll it back first.`);
    this.open = new Transaction(name, source, this);
    return this.open;
  }

  /**
   * Runs `body` in a transaction: commits when it returns, rolls back if it throws (and rethrows).
   * Returns the body's result. A transaction with no changes leaves no undo step.
   */
  run<R>(name: string, body: (t: Transaction) => R, source = 'user'): R {
    const t = this.start(name, source);
    try {
      const r = body(t);
      t.commit();
      return r;
    } catch (e) {
      if (t.status === 'started') t.rollBack();
      throw e;
    }
  }

  /** Groups every transaction until `assimilate` into one undo step named `name`. */
  startGroup(name: string, source = 'user'): void {
    if (this.group || this.open) throw new TransactionError('A transaction or group is already open.');
    this.group = { name, source, parts: [] };
  }

  /** Closes the group as a single undo step. */
  assimilate(): void {
    const g = this.group;
    this.group = null;
    if (!g) return;
    const changes = g.parts.flat();
    if (changes.length) this.push({ id: ++this.seq, name: g.name, source: g.source, time: Date.now(), changes });
    this.emit();
  }

  /** Discards the group, undoing everything committed inside it. */
  rollBackGroup(): void {
    const g = this.group;
    this.group = null;
    if (!g) return;
    for (const part of [...g.parts].reverse()) for (const c of [...part].reverse()) c.apply(c.before);
    this.emit();
  }

  /** @internal called by Transaction */
  finish(t: Transaction, commit: boolean): void {
    if (t !== this.open) throw new TransactionError(`"${t.name}" is not the open transaction.`);
    this.open = null;
    if (!commit) {
      t.status = 'rolledBack';
      for (const c of [...t.changes].reverse()) c.apply(c.before);
      this.emit();
      return;
    }
    t.status = 'committed';
    const real = t.changes.filter((c) => !sameState(c.before, c.after));
    if (!real.length) return;
    if (this.group) this.group.parts.push(real);
    else this.push({ id: ++this.seq, name: t.name, source: t.source, time: Date.now(), changes: real });
    this.emit();
  }

  private push(tx: CommittedTransaction): void {
    this.undoStack.push(tx);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.open && !this.group;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.open && !this.group;
  }

  /** Undo names, most recent first (Revit's undo drop-down). */
  get undoList(): string[] {
    return this.undoStack.map((t) => t.name).reverse();
  }

  get redoList(): string[] {
    return this.redoStack.map((t) => t.name).reverse();
  }

  /** Undoes the last `steps` transactions. Returns the names undone. */
  undo(steps = 1): string[] {
    const done: string[] = [];
    while (steps-- > 0 && this.canUndo) {
      const tx = this.undoStack.pop()!;
      for (const c of [...tx.changes].reverse()) c.apply(c.before);
      this.redoStack.push(tx);
      done.push(tx.name);
    }
    if (done.length) this.emit();
    return done;
  }

  redo(steps = 1): string[] {
    const done: string[] = [];
    while (steps-- > 0 && this.canRedo) {
      const tx = this.redoStack.pop()!;
      for (const c of tx.changes) c.apply(c.after);
      this.undoStack.push(tx);
      done.push(tx.name);
    }
    if (done.length) this.emit();
    return done;
  }

  /** Forgets everything (e.g. a new document was opened). */
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.open = null;
    this.group = null;
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

function sameState(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
