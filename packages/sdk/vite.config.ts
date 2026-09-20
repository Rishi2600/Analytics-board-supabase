import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Library build. The size budget is 5KB gzipped, which is why this has no dependencies:
// every byte here ships inside a customer's application, on their critical path.
export default defineConfig({
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      name: 'Analytics',
      formats: ['es', 'cjs', 'iife'],
      fileName: (format) => (format === 'es' ? 'analytics.js' : `analytics.${format}.js`),
    },
    // Vite 8 minifies with Oxc; naming esbuild here would require installing it separately.
    minify: true,
    sourcemap: true,
    rollupOptions: {
      output: { exports: 'named' },
    },
  },
})
