import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const uiSrc = fileURLToPath(new URL('../../packages/ui/src/', import.meta.url));

// BASE is set by the GitHub Pages workflow to "/Shanku/".
export default defineConfig({
  base: process.env.BASE ?? '/',
  plugins: [react()],
  resolve: {
    // Work against @cad2bim/ui source for instant HMR; the package build is checked in CI.
    alias: [
      { find: /^@cad2bim\/ui\/styles\.css$/, replacement: `${uiSrc}styles.css` },
      { find: /^@cad2bim\/ui$/, replacement: `${uiSrc}index.ts` },
    ],
  },
});
