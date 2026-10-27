// Inlines the ES modules into a single self-contained index.html.
//
// A key tool should run from file:// with nothing else alongside it, and ES
// module imports are blocked there by CORS. So the modules stay the source of
// truth (Node tests import them directly) and this flattens them into one
// <script> for the page.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, 'src');

// Dependency order: each module only uses names declared above it.
const MODULES = [
  'ripemd160.js',
  'hashes.js',
  'encoding.js',
  'secp256k1.js',
  'btc-keys.js',
  'ui.js',
];

function flatten(name) {
  const code = readFileSync(join(src, name), 'utf8');
  return code
    // Drop import statements; everything shares one scope once inlined.
    .replace(/^import\b[^;]*;\s*/gm, '')
    // Drop re-export statements for the same reason.
    .replace(/^export\s*\{[^}]*\}\s*;\s*/gm, '')
    // Turn declarations back into plain ones.
    .replace(/^export\s+(?=(const|let|var|function|async|class)\b)/gm, '')
    .trim();
}

const bundle = MODULES
  .map((name) => `/* ---- ${name} ---- */\n${flatten(name)}`)
  .join('\n\n');

const template = readFileSync(join(src, 'index.template.html'), 'utf8');
if (!template.includes('/*BUNDLE*/')) throw new Error('template is missing the /*BUNDLE*/ marker');

const html = template.replace('/*BUNDLE*/', () => bundle);
writeFileSync(join(here, 'index.html'), html);

const kb = (html.length / 1024).toFixed(1);
console.log(`index.html written — ${kb} kB, ${MODULES.length} modules inlined`);
