// Bundles the app into a single self-contained site/index.html (works offline, from file://)
// and writes Netlify's security headers with a CSP that pins the inline script and style.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const { outputFiles } = await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'inline',
  write: false,
});
// Avoid a literal "</script" inside the inline script.
const script = outputFiles[0].text.replaceAll('</script', '<\\/script');
const style = readFileSync('src/style.css', 'utf8');

const hash = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${hash(script)}`,
  `style-src ${hash(style)}`,
  'img-src data:',
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

const html = readFileSync('src/index.html', 'utf8')
  .replace('__CSP__', csp)
  .replace('__STYLE__', () => style)
  .replace('__SCRIPT__', () => script);

mkdirSync('site', { recursive: true });
writeFileSync('site/index.html', html);
writeFileSync('site/_headers', `/*
  Content-Security-Policy: ${csp}; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cache-Control: no-cache
`);
console.log(`site/index.html ${(html.length / 1024).toFixed(1)} KiB`);
