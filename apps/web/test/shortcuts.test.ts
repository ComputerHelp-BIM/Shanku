import { describe, expect, it } from 'vitest';
import { SEQUENCES, createSequenceReader } from '../src/lib/shortcuts';

describe('Revit two-letter shortcuts', () => {
  it('fires on the second letter of a known pair within the time window', () => {
    const read = createSequenceReader(1500);
    expect(read('Z', 0)).toBeNull();
    expect(read('F', 200)).toBe('fit');
  });

  it('ignores pairs typed too slowly and restarts cleanly after a hit', () => {
    const read = createSequenceReader(1500);
    read('H', 0);
    expect(read('I', 2000)).toBeNull();
    expect(read('W', 2100)).toBeNull();
    expect(read('F', 2200)).toBe('wireframe');
    expect(read('F', 2300)).toBeNull(); // "FF" is not a command, and WF was consumed
  });

  it('covers the cheat-sheet commands', () => {
    for (const k of ['ZF', 'ZE', 'ZX', 'ZA', 'ZP', 'ZC', 'ZR', 'ZZ', 'HI', 'IC', 'HH', 'HR', 'WF', 'HL', 'SD', 'CO', 'BX']) {
      expect(SEQUENCES[k]).toBeTruthy();
    }
  });
});
