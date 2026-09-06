import type { Plugin } from 'vite';

/**
 * Strip the comments out of the WGSL at build time.
 *
 * The shaders are template literals of WGSL carrying a running commentary —
 * why a lobe is evaluated toward the nearest point of the light, what a guard
 * is for, which of two renderers is the reference. That commentary is the most
 * valuable thing in the file to read and the least valuable thing to send: it
 * is a fifth of the bundle, and the GPU never sees it.
 *
 * WGSL has no string literal, so there is nothing a `//` can be inside except
 * a comment, and nothing a line break can be inside except code. That makes
 * the transform safe to do with a scanner rather than a parser: drop line
 * comments and block comments, drop blank lines, and take the indent off.
 * `${...}` interpolations are left alone — they hold other shader constants,
 * not text.
 */
export function wgslMinify(): Plugin {
  return {
    name: 'wgsl-minify',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('render/shaders.ts')) return null;
      const out = code.replace(/`([^`\\]*(?:\\.[^`\\]*)*)`/g, (whole, body: string) => {
        if (!/\n/.test(body) || !/[;{}]/.test(body)) return whole;
        const stripped = body
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .map((line) => {
            // a `//` outside an interpolation begins a comment; inside one it
            // could be a divide, so interpolations are stepped over whole
            let depth = 0;
            for (let i = 0; i < line.length; i++) {
              if (line[i] === '$' && line[i + 1] === '{') { depth++; i++; continue; }
              if (depth > 0) { if (line[i] === '}') depth--; continue; }
              if (line[i] === '/' && line[i + 1] === '/') return line.slice(0, i).trimEnd();
            }
            return line.trimEnd();
          })
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');
        return '`' + stripped + '`';
      });
      return { code: out, map: null };
    },
  };
}
