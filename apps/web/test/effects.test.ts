/**
 * Guard: an effect written as `useEffect(() => expr, deps)` returns expr's value to React as its
 * cleanup. When expr returns something that is not a function, React calls it on the next re-run or
 * unmount and the whole app crashes. This happened in 0.28.x: `scrollTo()` returns a Promise in
 * Chrome 154, so changing a Guide section or closing the window blanked the page. Effects must use
 * a block body; the only allowed concise body returns a real unsubscribe function.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', '../../packages/ui/src'].map((r) => join(__dirname, '..', r));
const ALLOWED = [/^history\.subscribe\(/]; // returns its unsubscribe function

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

describe('effects never return a stray value as their cleanup', () => {
  it('uses block bodies (except real unsubscribe functions)', () => {
    const offenders: string[] = [];
    for (const root of ROOTS)
      for (const f of files(root))
        readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const m = /useEffect\(\(\) => (?![{(])(.*)/.exec(line);
            if (m && !ALLOWED.some((a) => a.test(m[1].trim()))) offenders.push(`${f}:${i + 1}: ${line.trim()}`);
          });
    expect(offenders).toEqual([]);
  });
});
