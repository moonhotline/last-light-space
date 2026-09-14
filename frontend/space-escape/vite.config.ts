import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: Number(process.env.SPACE_WEB_PORT || 5180), strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
