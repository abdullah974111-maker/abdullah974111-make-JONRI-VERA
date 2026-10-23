const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('assert/strict');
const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Serve site/ like Netlify does, applying the _headers file
const headers = Object.fromEntries(fs.readFileSync('site/_headers', 'utf8').split('\n').slice(1)
  .filter(l => l.trim()).map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...headers });
  res.end(fs.readFileSync('site/index.html'));
}).listen(8765);

(async () => {
  const browser = await chromium.launch();
  const problems = [], requests = [];
  async function page(opts = {}) {
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text()); });
    p.on('pageerror', e => problems.push(e.message));
    p.on('request', r => { if (!r.url().startsWith('http://localhost:8765/') && !r.url().startsWith('data:') && !r.url().startsWith('file:')) requests.push(r.url()); });
    p.on('dialog', d => d.accept());
    return { ctx, p };
  }

  // 1. Served over HTTP with Netlify headers: generate a 12-word wallet
  let { ctx, p } = await page({ viewport: { width: 1100, height: 1400 } });
  await p.goto('http://localhost:8765/');
  await p.screenshot({ path: 'shots/1-start.png', fullPage: true });
  await p.click('#generate');
  const words = await p.$$eval('#phrase li', l => l.map(x => x.textContent));
  assert.equal(words.length, 12);
  const addrs = await p.$$eval('#receive tbody tr td.mono:not(.wif)', l => l.map(x => x.textContent));
  assert.equal(addrs.length, 5); assert.ok(addrs.every(a => a.startsWith('bc1q')));
  await p.screenshot({ path: 'shots/2-generated-concealed.png', fullPage: true });
  await p.click('#toggle-phrase'); await p.check('#show-keys');
  await p.screenshot({ path: 'shots/3-generated-revealed.png', fullPage: true });
  console.log('ok - generate 12 words:', addrs[0]);

  // 24 words
  await p.check('input[value="24"]', { force: true }); await p.click('#generate');
  assert.equal((await p.$$('#phrase li')).length, 24);
  console.log('ok - generate 24 words');

  // 2. Restore the BIP84 test vector and check the derived data in the DOM
  await p.click('#tab-restore');
  await p.fill('#restore-input', 'abandon abandon');
  await p.click('#restore');
  assert.match(await p.textContent('#restore-error'), /12, 15, 18, 21 or 24/);
  await p.fill('#restore-input', '  ' + ABANDON.toUpperCase() + '\n');
  await p.click('#restore');
  assert.equal(await p.textContent('#restore-error'), '');
  const r = await p.$$eval('#receive tbody tr', rows => rows.map(r => [...r.querySelectorAll('td.mono')].map(td => td.textContent)));
  assert.deepEqual(r[0], ['bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d']);
  assert.equal(await p.textContent('#xpub'), 'zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs');
  console.log('ok - restore matches BIP84 vector in the page');

  // Options re-derive: testnet + 10 addresses
  await p.click('.advanced summary');
  await p.selectOption('#network', 'testnet'); await p.selectOption('#count', '10');
  const t = await p.$$eval('#receive tbody tr td.mono:not(.wif)', l => l.map(x => x.textContent));
  assert.equal(t.length, 10); assert.equal(t[0], 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl');
  console.log('ok - testnet / count options');

  // Clear wipes everything
  await p.click('#clear');
  assert.equal(await p.isHidden('#result'), true);
  assert.equal(await p.$$eval('#phrase li', l => l.length), 0);
  console.log('ok - clear');
  await ctx.close();

  // 3. Dark mode + phone width
  ({ ctx, p } = await page({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', deviceScaleFactor: 2 }));
  await p.goto('http://localhost:8765/');
  await p.click('#generate'); await p.click('#toggle-phrase');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.equal(overflow, 0, 'horizontal scroll on phone');
  await p.screenshot({ path: 'shots/4-phone-dark.png', fullPage: true });
  console.log('ok - phone width, no horizontal scroll');
  await ctx.close();

  // 4. Opened as a downloaded file, fully offline
  ({ ctx, p } = await page({ viewport: { width: 1000, height: 900 }, offline: true }));
  await p.goto('file://' + path.resolve('site/index.html'));
  assert.match(await p.textContent('#net-status'), /Offline/);
  await p.click('#generate');
  assert.equal((await p.$$('#phrase li')).length, 12);
  console.log('ok - works offline from file://');
  await ctx.close();

  await browser.close(); server.close();
  assert.deepEqual(problems, [], 'console errors/CSP violations');
  assert.deepEqual(requests, [], 'external requests');
  console.log('ok - no console errors, no CSP violations, no external requests');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
