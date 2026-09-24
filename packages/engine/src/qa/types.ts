import type { ElementRecord, Level } from '../model/types';

export type Severity = 'error' | 'warning' | 'info';

/**
 * One QA result you can act on (docs/design/actionable-qa.md). Every finding says what was checked
 * (`measured`) and what it does not prove (`limits`), and lists the elements it is about.
 */
export interface Finding {
  /** Stable across runs: `${checkId}:${hash of the elements' GlobalIds}`. */
  id: string;
  checkId: string;
  group: QaGroup;
  severity: Severity;
  /** Names the problem: "Discontinuous column". */
  title: string;
  /** Names the element and the number: "Column C12 on Level 3 starts 450 mm above its support." */
  detail: string;
  clause?: string;
  measured: string;
  limits: string;
  /** Model element indices; empty for model-wide findings. */
  elements: number[];
}

export type QaGroup = 'model' | 'marks';

export interface QaContext {
  elements: readonly ElementRecord[];
  levels: readonly Level[];
}

export interface QaCheck {
  id: string;
  group: QaGroup;
  title: string;
  run(ctx: QaContext): Finding[];
}

export interface QaReport {
  findings: Finding[];
  /** Checks that ran, in order. */
  checks: Array<{ id: string; title: string; group: QaGroup; findings: number }>;
  ms: number;
}
