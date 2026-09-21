import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [webIfcWasm(), react()],
  resolve: {
    alias: [
      { find: /^@shanku\/ui\/styles\.css$/, replacement: `${uiSrc}styles.css` },
      { find: /^@shanku\/ui$/, replacement: `${uiSrc}index.ts` },
      { find: /^@shanku\/engine$/, replacement: `${engineSrc}index.ts` },
    ],
  },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['web-ifc'] },
  build: { chunkSizeWarningLimit: 2000 },
});
