/**
 * Per-file tab colours, like pyRevit's tab colouring: every view of one file shares a colour,
 * different files get different colours. Hues are spaced for colour-blind separation and avoid
 * the brand orange, which means "selected".
 */
export const DOC_COLORS = ['#2F7FD8', '#1F9E89', '#8B5CF6', '#C0446A', '#B58A00', '#4C8C3A', '#0E7490', '#7C5CBF'] as const;

export function nextDocColor(inUse: readonly string[]): string {
  return DOC_COLORS.find((c) => !inUse.includes(c)) ?? DOC_COLORS[inUse.length % DOC_COLORS.length];
}

export const UNIT_CHOICES = ['mm', 'cm', 'm', 'in', 'ft', 'unitless'] as const;
