import { describe, expect, it, vi } from 'vitest';
import { History, TransactionError } from '../src/doc/transactions';

const box = () => {
  const s = { v: 0 };
  return { s, apply: (x: number) => (s.v = x) };
};

describe('transactions (Revit-style)', () => {
  it('commits as one undo step and undoes / redoes exactly', () => {
    const h = new History();
    const b = box();
    h.run('Set to 5', (t) => t.change('v', b.s.v, 5, b.apply));
    h.run('Set to 9', (t) => {
      t.change('v', 5, 7, b.apply);
      t.change('v', 7, 9, b.apply); // same key merges: one change 5 -> 9
    });
    expect(b.s.v).toBe(9);
    expect(h.undoList).toEqual(['Set to 9', 'Set to 5']);
    h.undo();
    expect(b.s.v).toBe(5);
    h.undo();
    expect(b.s.v).toBe(0);
    h.redo(2);
    expect(b.s.v).toBe(9);
  });

  it('rolls back on error and leaves no undo step', () => {
    const h = new History();
    const b = box();
    expect(() =>
      h.run('Bad', (t) => {
        t.change('v', 0, 3, b.apply);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(b.s.v).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('allows only one open transaction, like Revit', () => {
    const h = new History();
    h.start('A');
    expect(() => h.start('B')).toThrow(TransactionError);
  });

  it('assimilates a group into one step and can roll the group back', () => {
    const h = new History();
    const b = box();
    h.startGroup('Drag box');
    for (let i = 1; i <= 5; i++) h.run('step', (t) => t.change('v', i - 1, i, b.apply));
    h.assimilate();
    expect(h.undoList).toEqual(['Drag box']);
    h.undo();
    expect(b.s.v).toBe(0);
    h.startGroup('Cancelled');
    h.run('x', (t) => t.change('v', 0, 4, b.apply));
    h.rollBackGroup();
    expect(b.s.v).toBe(0);
    expect(h.canUndo).toBe(false);
  });

  it('a new change clears redo; no-op transactions are not recorded; listeners hear changes', () => {
    const h = new History();
    const b = box();
    const fn = vi.fn();
    h.subscribe(fn);
    h.run('A', (t) => t.change('v', 0, 1, b.apply));
    h.undo();
    expect(h.canRedo).toBe(true);
    h.run('B', (t) => t.change('v', 0, 2, b.apply));
    expect(h.canRedo).toBe(false);
    h.run('Nothing', (t) => t.change('v', 2, 2, b.apply));
    expect(h.undoList).toEqual(['B']);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
