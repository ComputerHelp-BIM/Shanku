/**
 * Long operations report here so one progress display shows them all (lib → components/BuildProgress).
 * A task has a phase in plain words and, when the work can measure itself, a fraction; Revit's own
 * work (exporting, creating) cannot, so those show their phase with a running timer instead.
 */
import { useSyncExternalStore } from 'react';

export interface Task {
  id: string;
  title: string;
  phase: string;
  /** 0..1 when known; null: indeterminate. */
  fraction: number | null;
  /** e.g. "2,340 of 4,780 elements". */
  detail?: string;
  startedAt: number;
}

let tasks: Task[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startTask(id: string, title: string, phase: string, fraction: number | null = null): void {
  tasks = [...tasks.filter((t) => t.id !== id), { id, title, phase, fraction, startedAt: Date.now() }];
  emit();
}

export function updateTask(id: string, patch: Partial<Omit<Task, 'id' | 'startedAt'>>): void {
  if (!tasks.some((t) => t.id === id)) return;
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

export function endTask(id: string): void {
  if (!tasks.some((t) => t.id === id)) return;
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}

/** Runs `fn` as a task: started before, ended after, whatever happens. */
export async function withTask<T>(id: string, title: string, phase: string, fn: () => Promise<T>): Promise<T> {
  startTask(id, title, phase);
  try {
    return await fn();
  } finally {
    endTask(id);
  }
}

export function useTasks(): Task[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => tasks,
  );
}

/** Things worth knowing while waiting: real features and shortcuts, in rotation. */
export const WAITING_TIPS: readonly string[] = [
  'Ctrl+K finds any element by mark, Element ID or name.',
  'HI isolates the selection, HH hides it, HR resets.',
  'BX puts a section box around the selection.',
  'Tab cycles through elements that overlap under the cursor.',
  'Colour by grade, level or section: View → Colour by.',
  'Everything stays on this device: nothing is uploaded.',
  'Select a level in the Project Browser to pick everything on it.',
  'QA lists duplicates, missing marks and CH-LEVEL labels to update.',
  'The BOQ exports to Excel with your city’s rates.',
  'Measure and dimension like Revit: Annotate → Dimension.',
  'F1 opens the Guide at any time.',
];
