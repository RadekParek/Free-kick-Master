import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0', allowedHosts: ['.e2b.app', 'localhost'] },
  preview: { host: '0.0.0.0', allowedHosts: ['.e2b.app', 'localhost'] },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
