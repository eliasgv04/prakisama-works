// Plugin de Vite: al terminar el build genera dist/sw.js a partir de src/sw.js,
// inyectando la lista de archivos a precachear (app shell) y una versión derivada de su contenido.
// Así el service worker se escribe a mano, sin Workbox ni dependencias extra.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

export function swPrecache({ template = 'src/sw.js', output = 'sw.js' } = {}) {
  let root = process.cwd();
  let outDir = 'dist';
  return {
    name: 'prakisama-sw-precache',
    apply: 'build',
    configResolved(config) {
      root = config.root;
      outDir = join(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = walk(outDir)
        .map((file) => relative(outDir, file).replaceAll('\\', '/'))
        .filter((file) => file !== output && !file.endsWith('.map'))
        .sort();
      const hash = createHash('sha1');
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const version = hash.digest('hex').slice(0, 10);
      const source = readFileSync(join(root, template), 'utf8')
        .replace('__VERSION__', () => version)
        .replace('__PRECACHE__', () => JSON.stringify(files));
      writeFileSync(join(outDir, output), source);
    },
  };
}
