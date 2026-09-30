/**
 * /api/share — shared models (see _share-core.ts). Vercel runs this as a serverless function; Vercel Blob
 * holds the encrypted files (connect a Blob store to the project: BLOB_READ_WRITE_TOKEN). Optional:
 * SHARE_TEAM_CODE (uploads need it), CRON_SECRET (the daily cleanup, vercel.json crons).
 *   GET  ?op=info                     is sharing set up, what it allows
 *   POST ?op=token                    an upload permission for shares/<id>/model.bin (@vercel/blob/client)
 *   POST ?op=register                 { id, file, size, retention, deleteHash } after the upload
 *   GET  ?op=open&id=…                where to download the encrypted model (410 once expired)
 *   POST ?op=delete                   { id, secret }
 *   GET  ?op=cleanup                  expired shares removed (Authorization: Bearer CRON_SECRET)
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { MAX_BYTES, ShareError, TOKEN_MS, checkTeam, checkUploadPath, cleanup, info, open, register, remove } from './_share-core';
import { vercelStore as store } from './_share-vercel';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const configured = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const notSetUp = () => json(200, { available: false, why: 'Sharing models is not set up yet: connect a Vercel Blob store to the Shanku project (Vercel → Storage).' });

async function guard(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof ShareError) return json(e.status, { error: e.message });
    return json(500, { error: 'Sharing failed on the server; try again.' });
  }
}

export function GET(request: Request): Promise<Response> {
  return guard(async () => {
    const q = new URL(request.url).searchParams;
    const op = q.get('op');
    if (op === 'info') return configured() ? json(200, info(store, process.env.SHARE_TEAM_CODE)) : notSetUp();
    if (!configured()) return notSetUp();
    if (op === 'open') return json(200, await open(store, q.get('id')));
    if (op === 'cleanup') {
      if (process.env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return json(401, { error: 'Not allowed.' });
      return json(200, await cleanup(store));
    }
    return json(400, { error: 'Unknown operation.' });
  });
}

export function POST(request: Request): Promise<Response> {
  return guard(async () => {
    if (!configured()) return notSetUp();
    const op = new URL(request.url).searchParams.get('op');
    const body = (await request.json()) as Record<string, unknown>;
    if (op === 'token') {
      checkTeam(process.env.SHARE_TEAM_CODE, request.headers.get('x-shanku-team'));
      const result = await handleUpload({
        body: body as unknown as HandleUploadBody,
        request,
        onBeforeGenerateToken: async (pathname) => {
          await checkUploadPath(store, pathname);
          return { allowedContentTypes: ['application/octet-stream'], maximumSizeInBytes: MAX_BYTES, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + TOKEN_MS };
        },
      });
      return json(200, result);
    }
    if (op === 'register') {
      checkTeam(process.env.SHARE_TEAM_CODE, request.headers.get('x-shanku-team'));
      return json(200, await register(store, body));
    }
    if (op === 'delete') {
      await remove(store, body.id, body.secret);
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown operation.' });
  });
}
