import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5188 },
  // top-level await in main.ts: the WebGPU device is requested asynchronously
  build: { target: 'es2022' },
});
