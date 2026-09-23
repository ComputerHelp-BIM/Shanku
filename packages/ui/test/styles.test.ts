/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every rule as [selectors, declarations], top level only (enough for this flat stylesheet). */
function rules(source: string): Array<[string[], string]> {
  const out: Array<[string[], string]> = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push([m[1].split(',').map((s) => s.trim()).filter(Boolean), m[2]]);
  }
  return out;
}

describe('styles.css', () => {
  // Regression: 0.3.0–0.7.0 pasted the view-tab colour rules into this selector list,
  // so native buttons fell back to the browser font instead of IBM Plex Sans.
  it.each(['.sk-button', '.sk-icon-button', '.sk-ribbon-button', '.sk-ribbon-tab', '.sk-bottom-panel__tab', '.sk-view-tab__label', '.sk-view-tab__close'])(
    '%s inherits font and colour from the shell',
    (selector) => {
      const reset = rules(css).find(([sel, body]) => sel.includes(selector) && /font:\s*inherit/.test(body));
      expect(reset, `${selector} has no "font: inherit" rule`).toBeDefined();
      expect(reset![1]).toMatch(/color:\s*inherit/);
      expect(reset![1]).toMatch(/cursor:\s*pointer/);
    },
  );

  it('keeps the document-colour rules on view tabs only', () => {
    const tint = rules(css).filter(([, body]) => body.includes('--tab-color'));
    expect(tint.length).toBeGreaterThan(0);
    for (const [selectors] of tint) for (const s of selectors) expect(s).toMatch(/^\.sk-view-tab\.has-color/);
  });
});
