// Bundle del server con esbuild.
//
// Perche' serve: i pacchetti workspace (@boggle/shared, @boggle/dictionary) espongono
// sorgenti TypeScript. Node puro non puo' importarli, quindi li bundliamo qui dentro.
// Le dipendenze npm reali restano esterne e vengono risolte da node_modules.
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

const OUT = 'dist';
await rm(OUT, { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: `${OUT}/index.js`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Solo le dipendenze npm esterne; i pacchetti @boggle/* vengono inclusi nel bundle.
  external: ['express', 'cors', 'socket.io', 'node:sqlite'],
  banner: {
    js: [
      "import { createRequire as __cr } from 'node:module';",
      'const require = __cr(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
});

console.log('✓ Server bundle creato in dist/index.js');
