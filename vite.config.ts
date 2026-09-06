import { defineConfig } from 'vite';
import { wgslMinify } from './wgsl-minify';

/**
 * The built game is served from a project page — onion2k.github.io/chess/ —
 * so it asks for its assets under that path. The dev server keeps the root,
 * where there is nothing above it.
 */
export default defineConfig(({ command, isPreview }) => ({
  plugins: [wgslMinify()],
  // `preview` serves what `build` made, so it takes the built path too;
  // otherwise the one command that can catch a base-path mistake would be the
  // one command that does not use the base
  base: command === 'build' || isPreview ? '/chess/' : '/',
  server: { port: 5188 },
  // top-level await in main.ts: the WebGPU device is requested asynchronously
  build: { target: 'es2022' },
}));
