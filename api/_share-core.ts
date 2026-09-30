/**
 * Shared models (opt-in): a model uploaded so a view link opens without the file at hand.
 *
 * Privacy: the browser gzips and encrypts the model (AES-GCM 256) before upload; the key travels only in
 * the link's #fragment, which browsers never send to a server, so the stored copy is unreadable without
 * the link. The delete secret stays with the sharer; only its SHA-256 is stored. No sign-in (internal
 * team use): an optional SHARE_TEAM_CODE limits who may upload. Each share is kept 1 hour, 1 day, 3 days
 * or until deleted; an expired share is refused at once and removed by the daily cleanup.
 *
 * Storage sits behind ShareStore: Vercel Blob in production (_share-vercel.ts), a folder in development
 * and tests (_share-local.ts). This file has no dependency on either.
 */
import { createHash } from 'node:crypto';

export const RETENTIONS = { '1h': 3_600_000, '1d': 86_400_000, '3d': 3 * 86_400_000, keep: null } as const;
export type Retention = keyof typeof RETENTIONS;
/** Largest shared model (encrypted, compressed), bytes. */
export const MAX_BYTES = 100 * 1024 * 1024;
/** How long an upload permission lasts (ms). */
export const TOKEN_MS = 10 * 60_000;

export interface ShareMeta {
  v: 1;
  id: string;
  /** The model's file name, shown to whoever opens the link. */
  file: string;
  size: number;
  createdAt: number;
  /** null: until someone deletes it. */
  expiresAt: number | null;
  deleteHash: string;
}

export interface ShareStore {
  mode: 'vercel' | 'local';
  getMeta(id: string): Promise<ShareMeta | null>;
  putMeta(meta: ShareMeta): Promise<void>;
  /** Where the browser downloads the encrypted model, or null when it is not there. */
  dataUrl(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
  listIds(): Promise<string[]>;
}

export class ShareError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** 16 random bytes, base64url: 22 characters. */
export const isShareId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{22}$/.test(id);
export const dataPath = (id: string) => `shares/${id}/model.bin`;
export const metaPath = (id: string) => `shares/${id}/meta.json`;
export const sha256hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** A file name safe to show and store: no folders, no control characters, at most 120 characters. */
export function cleanFileName(name: unknown): string {
  const base = String(name ?? '').split(/[\\/]/).pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f<>"|?*]/g, '').trim().slice(0, 120);
  return clean || 'model.ifc';
}

/** The team code check: when SHARE_TEAM_CODE is set, uploads must carry it. */
export function checkTeam(expected: string | undefined, given: string | null): void {
  if (!expected) return;
  if (!given || given !== expected) throw new ShareError(403, 'Uploading a shared model needs your team code (ask whoever set up Shanku).');
}

export function info(store: ShareStore, teamCode: string | undefined) {
  return { available: true, mode: store.mode, retentions: Object.keys(RETENTIONS), maxBytes: MAX_BYTES, teamCode: !!teamCode };
}

/** An upload permission may only be for a new share's model file. */
export async function checkUploadPath(store: ShareStore, pathname: string): Promise<string> {
  const m = /^shares\/([A-Za-z0-9_-]{22})\/model\.bin$/.exec(pathname);
  if (!m) throw new ShareError(400, 'Uploads go to shares/<id>/model.bin.');
  if (await store.getMeta(m[1])) throw new ShareError(409, 'That share already exists.');
  return m[1];
}

/** After the upload: the share's record (retention, the delete secret's hash). */
export async function register(store: ShareStore, body: Record<string, unknown>, now = Date.now()): Promise<{ id: string; expiresAt: number | null }> {
  const { id, retention, deleteHash, size } = body;
  if (!isShareId(id)) throw new ShareError(400, 'Not a share id.');
  if (typeof retention !== 'string' || !(retention in RETENTIONS)) throw new ShareError(400, 'Keep it 1 hour, 1 day, 3 days, or until deleted.');
  if (typeof deleteHash !== 'string' || !/^[0-9a-f]{64}$/.test(deleteHash)) throw new ShareError(400, 'The delete secret’s hash is missing.');
  if (typeof size !== 'number' || !(size > 0) || size > MAX_BYTES) throw new ShareError(400, `A shared model is at most ${MAX_BYTES / 1048576} MB.`);
  if (await store.getMeta(id)) throw new ShareError(409, 'That share already exists.');
  if (!(await store.dataUrl(id))) throw new ShareError(400, 'The model was not uploaded.');
  const ms = RETENTIONS[retention as Retention];
  const meta: ShareMeta = { v: 1, id, file: cleanFileName(body.file), size, createdAt: now, expiresAt: ms === null ? null : now + ms, deleteHash };
  await store.putMeta(meta);
  return { id, expiresAt: meta.expiresAt };
}

/** Opening a link: where to download the encrypted model; an expired share is refused and removed. */
export async function open(store: ShareStore, id: unknown, now = Date.now()) {
  if (!isShareId(id)) throw new ShareError(400, 'Not a share id.');
  const meta = await store.getMeta(id);
  if (!meta) throw new ShareError(404, 'This shared model is not there: it was deleted, or the link is wrong.');
  if (meta.expiresAt !== null && meta.expiresAt <= now) {
    await store.remove(id).catch(() => undefined);
    throw new ShareError(410, 'This shared model has expired and was deleted.');
  }
  const url = await store.dataUrl(id);
  if (!url) throw new ShareError(404, 'This shared model is not there any more.');
  return { file: meta.file, size: meta.size, expiresAt: meta.expiresAt, url };
}

/** Deleting needs the secret only the sharer's browser has. */
export async function remove(store: ShareStore, id: unknown, secret: unknown): Promise<void> {
  if (!isShareId(id)) throw new ShareError(400, 'Not a share id.');
  const meta = await store.getMeta(id);
  if (!meta) return; // already gone
  if (typeof secret !== 'string' || sha256hex(secret) !== meta.deleteHash) throw new ShareError(403, 'Only whoever shared it can delete it (from the browser it was shared from).');
  await store.remove(id);
}

/** The daily cleanup: every expired share removed. */
export async function cleanup(store: ShareStore, now = Date.now()): Promise<{ removed: number; kept: number }> {
  let removed = 0,
    kept = 0;
  for (const id of await store.listIds()) {
    const meta = await store.getMeta(id);
    if (meta && (meta.expiresAt === null || meta.expiresAt > now)) kept++;
    else {
      await store.remove(id);
      removed++;
    }
  }
  return { removed, kept };
}
