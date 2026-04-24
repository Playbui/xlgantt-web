import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

await build({
  entryPoints: [
    path.join(root, 'api-src/ai/command.ts'),
    path.join(root, 'api-src/ai/copilot.ts'),
  ],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outdir: path.join(root, 'api/ai'),
  outExtension: { '.js': '.mjs' },
  tsconfig: path.join(root, 'tsconfig.json'),
  logLevel: 'warning',
  loader: {
    '.css': 'empty',
    '.svg': 'empty',
    '.png': 'empty',
    '.jpg': 'empty',
    '.woff': 'empty',
    '.woff2': 'empty',
    '.ttf': 'empty',
  },
  banner: {
    js: "import{createRequire as __cR}from'module';const require=__cR(import.meta.url);",
  },
  allowOverwrite: true,
});

console.log('[build-api] bundled api/ai/*.mjs');
