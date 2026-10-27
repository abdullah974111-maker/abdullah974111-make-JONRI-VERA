// Browser interface. No network calls: the page is meant to be saved and opened
// from disk, ideally on a machine that is offline.

const uiEl = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const uiFind = (id) => document.getElementById(id);

function uiRow(label, value, { mono = true, note } = {}) {
  const row = uiEl('div', 'row');
  const head = uiEl('div', 'row-label');
  head.append(uiEl('span', null, label));
  if (note) head.append(uiEl('span', 'row-note', note));
  row.append(head);

  const body = uiEl('div', 'row-value');
  const text = uiEl('code', mono ? 'mono' : null, value);
  body.append(text);

  const copy = uiEl('button', 'copy', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      copy.textContent = 'Copied';
    } catch {
      // Clipboard access can be denied; selecting the text still works.
      const range = document.createRange();
      range.selectNodeContents(text);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      copy.textContent = 'Selected';
    }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1400);
  });
  body.append(copy);

  row.append(body);
  return row;
}

function uiCard(title, rows) {
  const card = uiEl('section', 'card');
  card.append(uiEl('h3', null, title));
  for (const row of rows) card.append(row);
  return card;
}

function uiSetError(id, message) {
  const box = uiFind(id);
  box.textContent = message ?? '';
  box.hidden = !message;
}

/* ----------------------------- single key ----------------------------- */

let uiSingleTimer = null;

async function uiRenderSingle() {
  const input = uiFind('key-input').value;
  const out = uiFind('key-output');
  out.replaceChildren();

  if (!input.trim()) {
    uiSetError('key-error', null);
    out.append(uiEl('p', 'placeholder', 'Enter a private key, or generate one.'));
    return;
  }

  let network = uiFind('key-network').value;

  try {
    const parsed = await parsePrivateKey(input);
    // A WIF encodes its own network; honour it and tell the user.
    const wifNetwork = parsed.format === 'wif' ? parsed.network : null;
    if (wifNetwork) network = wifNetwork;

    const described = await describePrivateKey(parsed.key, { network });
    uiSetError('key-error', null);

    const notes = [`read as ${parsed.format}`];
    if (wifNetwork) notes.push(`WIF says ${wifNetwork}`);
    if (parsed.format === 'wif') {
      notes.push(parsed.compressed ? 'compressed flag set' : 'uncompressed flag set');
    }
    out.append(uiEl('p', 'parsed-note', notes.join(' · ')));

    out.append(uiCard('Private key', [
      uiRow('Hex (32 bytes)', described.privateKey.hex),
      uiRow('Decimal', described.privateKey.decimal),
      uiRow('WIF', described.privateKey.wifCompressed, { note: 'compressed' }),
      uiRow('WIF', described.privateKey.wifUncompressed, { note: 'uncompressed' }),
    ]));

    out.append(uiCard('Public key', [
      uiRow('Compressed (33 bytes)', described.publicKey.compressed),
      uiRow('Uncompressed (65 bytes)', described.publicKey.uncompressed),
      uiRow('Point x', described.publicKey.x),
      uiRow('Point y', described.publicKey.y),
      uiRow('HASH160', described.publicKey.hash160Compressed, { note: 'of compressed key' }),
    ]));

    out.append(uiCard('Addresses', [
      uiRow('P2PKH', described.addresses.p2pkhCompressed, { note: 'compressed · BIP44' }),
      uiRow('P2PKH', described.addresses.p2pkhUncompressed, { note: 'uncompressed · legacy' }),
      uiRow('P2SH-P2WPKH', described.addresses.p2shP2wpkh, { note: 'nested segwit · BIP49' }),
      uiRow('P2WPKH', described.addresses.p2wpkh, { note: 'native segwit · BIP84' }),
      uiRow('P2TR', described.addresses.p2tr, { note: 'taproot · BIP86' }),
    ]));
  } catch (error) {
    uiSetError('key-error', error.message);
    out.append(uiEl('p', 'placeholder', 'Nothing to show yet.'));
  }
}

function uiQueueSingle() {
  clearTimeout(uiSingleTimer);
  uiSingleTimer = setTimeout(uiRenderSingle, 120);
}

/* ------------------------------ HD wallet ----------------------------- */

async function uiRootNode() {
  const extended = uiFind('hd-xkey').value.trim();
  if (extended) {
    const { node, network, hasPrivateKey } = await parseExtendedKey(extended);
    return { node, network, hasPrivateKey, source: 'extended key' };
  }

  const seedHex = uiFind('hd-seed').value.trim();
  if (!seedHex) return null;

  const node = await masterFromSeed(hexToBytes(seedHex));
  return {
    node,
    network: uiFind('hd-network').value,
    hasPrivateKey: true,
    source: 'seed',
  };
}

async function uiRenderHd() {
  const out = uiFind('hd-output');
  out.replaceChildren();

  let root;
  try {
    root = await uiRootNode();
  } catch (error) {
    uiSetError('hd-error', error.message);
    return;
  }

  if (!root) {
    uiSetError('hd-error', null);
    out.append(uiEl('p', 'placeholder', 'Enter a seed or an extended key, or generate a seed.'));
    return;
  }

  const path = uiFind('hd-path').value.trim() || 'm';
  const count = Math.min(Math.max(Number(uiFind('hd-count').value) || 1, 1), 50);

  try {
    const { node, network, hasPrivateKey } = root;

    const masterRows = [];
    if (hasPrivateKey) {
      masterRows.push(uiRow(
        node.depth === 0 ? 'Master xprv' : 'Extended private key',
        await serializeExtendedKey(node, { network, private: true }),
      ));
    }
    masterRows.push(uiRow(
      node.depth === 0 ? 'Master xpub' : 'Extended public key',
      await serializeExtendedKey(node, { network, private: false }),
    ));
    masterRows.push(uiRow('Depth', String(node.depth), { mono: false }));
    out.append(uiCard(`Root (${root.source}, ${network})`, masterRows));

    const account = await derivePath(node, path);
    if (path !== 'm') {
      const accountRows = [];
      if (account.privateKey) {
        accountRows.push(uiRow(
          'xprv',
          await serializeExtendedKey(account, { network, private: true }),
        ));
      }
      accountRows.push(uiRow(
        'xpub',
        await serializeExtendedKey(account, { network, private: false }),
      ));
      out.append(uiCard(`At ${path}`, accountRows));
    }

    const type = uiFind('hd-type').value === 'auto'
      ? addressTypeForPath(path)
      : uiFind('hd-type').value;

    const table = uiEl('table', 'derived');
    const headRow = uiEl('tr');
    for (const column of ['Path', `Address (${type})`, 'Public key', 'WIF']) {
      headRow.append(uiEl('th', null, column));
    }
    const thead = uiEl('thead');
    thead.append(headRow);
    table.append(thead);

    const body = uiEl('tbody');
    for (let i = 0; i < count; i++) {
      const child = await deriveChild(account, i);
      const pubHex = bytesToHex(child.publicKey);
      const tr = uiEl('tr');
      tr.append(uiEl('td', 'mono', `${path === 'm' ? 'm' : path}/${i}`));
      tr.append(uiEl('td', 'mono wrap', await addressFromPublicKey(pubHex, type, network)));
      tr.append(uiEl('td', 'mono wrap dim', pubHex));
      tr.append(uiEl('td', 'mono wrap dim', child.privateKey
        ? await encodeWif(child.privateKey, { compressed: true, network })
        : '—'));
      body.append(tr);
    }
    table.append(body);

    const wrap = uiEl('section', 'card');
    wrap.append(uiEl('h3', null, 'Derived addresses'));
    const scroll = uiEl('div', 'scroll');
    scroll.append(table);
    wrap.append(scroll);
    out.append(wrap);

    uiSetError('hd-error', null);
  } catch (error) {
    uiSetError('hd-error', error.message);
  }
}

/* ------------------------------- wiring ------------------------------- */

function uiInit() {
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      for (const other of document.querySelectorAll('[data-tab]')) {
        other.classList.toggle('active', other === tab);
      }
      for (const panel of document.querySelectorAll('[data-panel]')) {
        panel.hidden = panel.dataset.panel !== tab.dataset.tab;
      }
    });
  }

  uiFind('key-input').addEventListener('input', uiQueueSingle);
  uiFind('key-network').addEventListener('change', uiRenderSingle);
  uiFind('key-generate').addEventListener('click', () => {
    uiFind('key-input').value = bytesToHex(randomPrivateKey());
    uiRenderSingle();
  });
  uiFind('key-clear').addEventListener('click', () => {
    uiFind('key-input').value = '';
    uiRenderSingle();
  });

  for (const id of ['hd-seed', 'hd-xkey', 'hd-path', 'hd-count']) {
    uiFind(id).addEventListener('input', () => {
      clearTimeout(uiSingleTimer);
      uiSingleTimer = setTimeout(uiRenderHd, 150);
    });
  }
  for (const id of ['hd-network', 'hd-type']) {
    uiFind(id).addEventListener('change', uiRenderHd);
  }
  uiFind('hd-generate').addEventListener('click', () => {
    uiFind('hd-seed').value = bytesToHex(randomSeed(32));
    uiFind('hd-xkey').value = '';
    uiRenderHd();
  });

  uiRenderSingle();
  uiRenderHd();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', uiInit);
} else {
  uiInit();
}
