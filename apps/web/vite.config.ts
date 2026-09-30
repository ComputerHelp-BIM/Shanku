import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_BYTES, ShareError, checkTeam, checkUploadPath, cleanup, info, open, register, remove } from '../../api/_share-core';
import { localStore } from '../../api/_share-local';

const here = dirname(fileURLToPath(import.meta.url));
const uiSrc = join(here, '../../packages/ui/src/');
const engineSrc = join(here, '../../packages/engine/src/');

/** Copies web-ifc's single-threaded WASM into public/wasm so dev and build serve it at BASE/wasm/. */
function webIfcWasm(): Plugin {
  return {
    name: 'shanku-web-ifc-wasm',
    buildStart() {
      const require = createRequire(import.meta.url);
      const src = require.resolve('web-ifc/web-ifc.wasm');
      const out = join(here, 'public/wasm');
      mkdirSync(out, { recursive: true });
      copyFileSync(src, join(out, 'web-ifc.wasm'));
    },
  };
}

// BASE is set by the GitHub Pages workflow to "/Shanku/".
/**
 * /api/share in development and preview (npm run dev / preview): the same rules as the serverless route
 * (api/_share-core.ts), storing shared models in node_modules/.shanku-shares instead of Vercel Blob.
 */
function shareDev(): Plugin {
  const serve = (server: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => void } }) => {
    const store = localStore(join(here, 'node_modules/.shanku-shares'), (id) => `/api/share?op=data&id=${id}`);
    const read = (req: IncomingMessage) =>
      new Promise<Buffer>((ok, bad) => {
        const parts: Buffer[] = [];
        req.on('data', (c: Buffer) => parts.push(c));
        req.on('end', () => ok(Buffer.concat(parts)));
        req.on('error', bad);
      });
    const send = (res: ServerResponse, status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(body));
    };
    server.middlewares.use('/api/share', (req, res) => {
      void (async () => {
        const q = new URL(req.url ?? '', 'http://x').searchParams;
        const op = q.get('op');
        const team = process.env.SHARE_TEAM_CODE;
        try {
          if (req.method === 'GET' && op === 'info') return send(res, 200, info(store, team));
          if (req.method === 'PUT' && op === 'upload') {
            checkTeam(team, (req.headers['x-shanku-team'] as string) ?? null);
            const id = await checkUploadPath(store, `shares/${q.get('id')}/model.bin`);
            const bytes = await read(req);
            if (bytes.byteLength > MAX_BYTES) throw new ShareError(413, 'Too large.');
            await store.writeData(id, new Uint8Array(bytes));
            return send(res, 200, { ok: true });
          }
          if (req.method === 'GET' && op === 'data') {
            const bytes = await store.readData(String(q.get('id')));
            if (!bytes) return send(res, 404, { error: 'Not there.' });
            res.setHeader('content-type', 'application/octet-stream');
            return res.end(Buffer.from(bytes));
          }
          if (req.method === 'GET' && op === 'open') return send(res, 200, await open(store, q.get('id')));
          if (req.method === 'GET' && op === 'cleanup') return send(res, 200, await cleanup(store));
          if (req.method === 'POST') {
            const body = JSON.parse((await read(req)).toString('utf8') || '{}');
            if (op === 'register') {
              checkTeam(team, (req.headers['x-shanku-team'] as string) ?? null);
              return send(res, 200, await register(store, body));
            }
            if (op === 'delete') {
              await remove(store, body.id, body.secret);
              return send(res, 200, { ok: true });
            }
          }
          return send(res, 400, { error: 'Unknown operation.' });
        } catch (e) {
          return send(res, e instanceof ShareError ? e.status : 500, { error: (e as Error).message });
        }
      })();
    });
  };
  return { name: 'shanku-share-dev', configureServer: serve, configurePreviewServer: serve };
}

export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [shareDev(), webIfcWasm(), react()],
  resolve: {
    alias: [
      { find: /^@shanku\/ui\/styles\.css$/, replacement: `${uiSrc}styles.css` },
      { find: /^@shanku\/ui$/, replacement: `${uiSrc}index.ts` },
      { find: /^@shanku\/engine$/, replacement: `${engineSrc}index.ts` },
    ],
  },
  // Stamped at build time: the legal notice says which month the features and compatibility data describe.
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString()) },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['web-ifc'] },
  build: { chunkSizeWarningLimit: 2000 },
});
