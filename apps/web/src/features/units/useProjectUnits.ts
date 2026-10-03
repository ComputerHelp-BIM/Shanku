/**
 * Project Units (decision 27A, Revit's Project Units, UN): how lengths are shown and typed — mm, cm, m or
 * feet-inches, decimals and digit grouping. Kept with each project (and in its file); a new project starts from
 * the last units chosen on this device.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_UNITS, setDisplayUnits, type DisplayUnits } from '@cad2bim/engine';
import { loadUnits, saveUnits } from '../../lib/session';
import type { useShankuModel } from '../../lib/useShankuModel';

const LAST = 'shanku.lastUnits';
const lastUnits = (): DisplayUnits => {
  try {
    return { ...DEFAULT_UNITS, ...(JSON.parse(localStorage.getItem(LAST) ?? 'null') ?? {}) };
  } catch {
    return DEFAULT_UNITS;
  }
};

export function useProjectUnits({ m }: { m: ReturnType<typeof useShankuModel> }) {
  const [units, setUnits] = useState<DisplayUnits>(lastUnits);
  const fileName = m.model?.info.fileName ?? null;
  useEffect(() => {
    if (!fileName) return;
    void loadUnits<DisplayUnits>(fileName).then((u) => setUnits(u ? { ...DEFAULT_UNITS, ...u } : lastUnits()));
  }, [fileName]);
  useEffect(() => {
    setDisplayUnits(units);
  }, [units]);
  const change = (u: DisplayUnits) => {
    setUnits(u);
    localStorage.setItem(LAST, JSON.stringify(u));
    if (fileName) void saveUnits(fileName, u);
  };
  return { units, setProjectUnits: change };
}
