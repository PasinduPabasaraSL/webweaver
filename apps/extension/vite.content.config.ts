import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Content scripts declared in the manifest are classic scripts, so this bundle must be a
// single self-contained IIFE with no chunk imports.
export default defineConfig({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome116',
    sourcemap: true,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'WebWeaverContent',
      fileName: () => 'content.js',
    },
  },
});
