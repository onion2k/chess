import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { defineConfig } from 'vite';
import { wgslMinify } from './wgsl-minify';

// Where the renderer actually is: inside node_modules when it was installed,
// and a checkout elsewhere on the disk when it was linked for working on both
// at once. The worker files inside it are fetched by URL, so the dev server
// has to be allowed to serve from there; a build inlines them and does not care.
const renderer = dirname(createRequire(import.meta.url).resolve('artshape-render/package.json'));

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
  server: { port: 5188, fs: { allow: ['.', renderer] } },
  // the renderer is TypeScript sources rather than a build: transformed like
  // the game's own code rather than pre-bundled, so its workers keep their URLs
  optimizeDeps: { exclude: ['artshape-render'] },
  // top-level await in main.ts: the WebGPU device is requested asynchronously.
  // `lamp.html` is the game-path spike, built alongside the game so that it
  // cannot rot without the build saying so.
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', lamp: 'lamp.html' } },
  },
}));
