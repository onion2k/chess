import { defineConfig } from 'vite';

/**
 * The built game is served from a project page — onion2k.github.io/chess/ —
 * so it asks for its assets under that path. The dev server keeps the root,
 * where there is nothing above it.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/chess/' : '/',
  server: { port: 5188 },
  // top-level await in main.ts: the WebGPU device is requested asynchronously
  build: { target: 'es2022' },
}));
