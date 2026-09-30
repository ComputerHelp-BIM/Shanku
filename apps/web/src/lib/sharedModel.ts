/**
 * Shared models (opt-in): the open model uploaded with a view link, so the link opens without the file.
 * The model is gzipped and encrypted here (AES-GCM 256, random key and IV) before it leaves the browser;
 * the key goes only into the link's #fragment (never sent to a server). The delete secret stays in this
 * browser ("My shared models"); the server keeps only its SHA-256. See api/_share-core.ts.
 */
import { upload } from '@vercel/blob/client';

export type Retention = '1h' | '1d' | '3d' | 'keep';
export const RETENTION_LABEL: Record<Retention, string> = { '1h': '1 hour', '1d': '1 day', '3d': '3 days', keep: 'Until deleted' };
const API = '/api/share';
const MINE = 'shanku.sharedModels';
const TEAM = 'shanku.shareTeamCode';

export interface ShareInfo {
  available: boolean;
  why?: string;
  mode?: 'vercel' | 'local';
  maxBytes?: number;
  teamCode?: boolean;
}

/** One of my shares, as kept in this browser. */
export interface MyShare {
  id: string;
  file: string;
  link: string;
  secret: string;
  createdAt: number;
  expiresAt: number | null;
}

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const isGzip = (b: Uint8Array) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());
}

/** gzip (unless it already is), then AES-GCM: 12-byte IV followed by the ciphertext. */
export async function seal(bytes: Uint8Array): Promise<{ data: Uint8Array; key: string }> {
  const plain = isGzip(bytes) ? bytes : await pipe(bytes, new CompressionStream('gzip'));
  const raw = random(32);
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = random(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource));
  const data = new Uint8Array(iv.length + ct.length);
  data.set(iv);
  data.set(ct, iv.length);
  return { data, key: b64u(raw) };
}

/** The reverse of seal; a wrong key or altered data throws. */
export async function unseal(data: Uint8Array, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', fromB64u(key) as BufferSource, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, k, data.slice(12)));
  return isGzip(plain) ? pipe(plain, new DecompressionStream('gzip')) : plain;
}

async function sha256hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const teamHeader = (): Record<string, string> => {
  const t = localStorage.getItem(TEAM);
  return t ? { 'x-shanku-team': t } : {};
};
export const setTeamCode = (code: string) => (code ? localStorage.setItem(TEAM, code) : localStorage.removeItem(TEAM));

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `The share server answered ${r.status}.`);
  return j;
}

/** Is sharing set up on this site, and what does it allow. */
export async function shareInfo(): Promise<ShareInfo> {
  try {
    return await api<ShareInfo>(`${API}?op=info`);
  } catch {
    return { available: false, why: 'Sharing models is not available on this site.' };
  }
}

/** The model's part of a link: `&model=<id>.<key>` (after the view token, in the #fragment). */
export const modelParam = (id: string, key: string) => `&model=${id}.${key}`;
export function readModelParam(hash: string): { id: string; key: string } | null {
  const m = /[#&]model=([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})/.exec(hash);
  return m ? { id: m[1], key: m[2] } : null;
}

/** Encrypts and uploads the model; returns the share (the link is the view link plus modelParam). */
export async function shareModel(bytes: Uint8Array, file: string, retention: Retention, viewLink: string, onStep?: (s: string) => void): Promise<MyShare> {
  const info = await shareInfo();
  if (!info.available) throw new Error(info.why ?? 'Sharing models is not set up.');
  onStep?.('Encrypting on this device…');
  const { data, key } = await seal(bytes);
  if (info.maxBytes && data.byteLength > info.maxBytes) throw new Error(`The model is ${(data.byteLength / 1048576).toFixed(0)} MB compressed; shared models are at most ${(info.maxBytes / 1048576).toFixed(0)} MB.`);
  const id = b64u(random(16));
  const secret = b64u(random(24));
  onStep?.(`Uploading ${(data.byteLength / 1048576).toFixed(1)} MB (encrypted)…`);
  const path = `shares/${id}/model.bin`;
  if (info.mode === 'local') {
    await api(`${API}?op=upload&id=${id}`, { method: 'PUT', body: data as BodyInit, headers: { 'content-type': 'application/octet-stream', ...teamHeader() } });
  } else {
    await upload(path, new Blob([data as BlobPart], { type: 'application/octet-stream' }), { access: 'public', handleUploadUrl: `${API}?op=token`, contentType: 'application/octet-stream', headers: teamHeader(), multipart: data.byteLength > 5 * 1048576 });
  }
  const r = await api<{ id: string; expiresAt: number | null }>(`${API}?op=register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...teamHeader() },
    body: JSON.stringify({ id, file, size: data.byteLength, retention, deleteHash: await sha256hex(secret) }),
  });
  const share: MyShare = { id, file, link: viewLink + modelParam(id, key), secret, createdAt: Date.now(), expiresAt: r.expiresAt };
  saveMine([share, ...myShares()]);
  return share;
}

/** Downloads and decrypts a shared model from a link. */
export async function openShared(id: string, key: string, onStep?: (s: string) => void): Promise<{ name: string; bytes: Uint8Array }> {
  onStep?.('Finding the shared model…');
  const meta = await api<{ file: string; size: number; url: string }>(`${API}?op=open&id=${id}`);
  onStep?.(`Downloading ${(meta.size / 1048576).toFixed(1)} MB (encrypted)…`);
  const r = await fetch(meta.url);
  if (!r.ok) throw new Error('The shared model could not be downloaded.');
  onStep?.('Decrypting on this device…');
  try {
    return { name: meta.file, bytes: await unseal(new Uint8Array(await r.arrayBuffer()), key) };
  } catch {
    throw new Error('The link’s key does not open this model: the link may be cut short.');
  }
}

export function myShares(now = Date.now()): MyShare[] {
  try {
    const all = JSON.parse(localStorage.getItem(MINE) ?? '[]') as MyShare[];
    return all.filter((s) => s.expiresAt === null || s.expiresAt > now);
  } catch {
    return [];
  }
}
const saveMine = (list: MyShare[]) => localStorage.setItem(MINE, JSON.stringify(list.slice(0, 50)));

export async function deleteShare(s: MyShare): Promise<void> {
  await api(`${API}?op=delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id, secret: s.secret }) });
  saveMine(myShares().filter((x) => x.id !== s.id));
}
