/** Shared models in Vercel Blob (production): public but unguessable pathnames, encrypted content. */
import { BlobNotFoundError, del, head, list, put } from '@vercel/blob';
import { dataPath, isShareId, metaPath, type ShareMeta, type ShareStore } from './_share-core';

async function url(pathname: string): Promise<string | null> {
  try {
    return (await head(pathname)).url;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}

export const vercelStore: ShareStore = {
  mode: 'vercel',
  async getMeta(id) {
    const u = await url(metaPath(id));
    if (!u) return null;
    const r = await fetch(u, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as ShareMeta) : null;
  },
  async putMeta(meta) {
    await put(metaPath(meta.id), JSON.stringify(meta), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
  },
  dataUrl: (id) => url(dataPath(id)),
  async remove(id) {
    await del([metaPath(id), dataPath(id)]).catch(() => undefined);
  },
  async listIds() {
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const r = await list({ prefix: 'shares/', cursor, limit: 1000 });
      for (const b of r.blobs) {
        const id = b.pathname.split('/')[1];
        if (isShareId(id)) ids.add(id);
      }
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return [...ids];
  },
};
