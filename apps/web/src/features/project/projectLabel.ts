import type { ProjectStatus } from './useProjectFile';

/** The title bar's line about the project: where it is saved, and whether the file is behind the work. */
export function projectLabel(s: ProjectStatus, now = Date.now()): string {
  if (!s.file) return 'Kept on this device · not saved to a file';
  if (s.dirty) return `${s.file} · changes not saved to the file`;
  if (!s.savedAt) return `${s.file} · saved`;
  const min = Math.round((now - s.savedAt) / 60_000);
  const when = min < 1 ? 'just now' : min === 1 ? '1 min ago' : min < 60 ? `${min} min ago` : new Date(s.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${s.file} · ${s.linked ? 'saved' : 'downloaded'} ${when}`;
}
