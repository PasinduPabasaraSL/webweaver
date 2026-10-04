import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const root = import.meta.dirname;

/** Emits manifest.json with the version taken from package.json (single source of truth). */
function manifestPlugin(): Plugin {
  return {
    name: 'webweaver-manifest',
    generateBundle() {
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
        version: string;
      };
      const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as Record<
        string,
        unknown
      >;
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify({ ...manifest, version: pkg.version }, null, 2),
      });
    },
  };
}

// Builds the popup page and the module service worker. The content script needs a
// classic (non-module) bundle, so it is built separately by vite.content.config.ts.
export default defineConfig({
  root,
  base: './',
  plugins: [manifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(root, 'popup.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
