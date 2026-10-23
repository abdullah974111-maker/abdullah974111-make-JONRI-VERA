import { NETWORKS, newMnemonic, normalizeMnemonic, checkMnemonic, deriveWallet } from './wallet.js';

const $ = (id) => document.getElementById(id);
let current = null; // { mnemonic, wallet, network }

// Online/offline indicator
function updateNetStatus() {
  const chip = $('net-status');
  const online = navigator.onLine;
  chip.className = `chip ${online ? 'online' : 'offline'}`;
  chip.textContent = online ? 'Online: fine for testing' : 'Offline: safest mode';
}
addEventListener('online', updateNetStatus);
addEventListener('offline', updateNetStatus);
updateNetStatus();

// The download link only makes sense when served over http(s)
if (location.protocol === 'file:') {
  $('download-link').replaceWith(document.createTextNode('Save this page'));
}

// Tabs
const tabs = [['tab-new', 'panel-new'], ['tab-restore', 'panel-restore']];
for (const [tabId] of tabs) {
  $(tabId).addEventListener('click', () => {
    for (const [t, p] of tabs) {
      const active = t === tabId;
      $(t).setAttribute('aria-selected', String(active));
      $(p).hidden = !active;
    }
  });
}

function options() {
  return {
    network: $('network').value,
    count: Number($('count').value),
    passphrase: $('passphrase').value,
  };
}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast('Copy failed: select the text and copy it manually');
  }
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.className = 'ghost';
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function cell(row, text, className) {
  const td = row.insertCell();
  if (className) td.className = className;
  if (text !== undefined) td.textContent = text;
  return td;
}

function renderTable(table, entries) {
  table.replaceChildren();
  const head = table.createTHead().insertRow();
  for (const [label, cls] of [['#'], ['Address'], [''], ['Private key (WIF)', 'key-col'], ['', 'key-col']]) {
    const th = document.createElement('th');
    th.textContent = label;
    if (cls) th.className = cls;
    head.append(th);
  }
  const body = table.createTBody();
  entries.forEach((entry, i) => {
    const row = body.insertRow();
    cell(row, String(i), 'idx');
    const addr = cell(row, entry.address, 'mono');
    addr.title = entry.path;
    cell(row, undefined, 'btn').append(button('Copy', () => copy(entry.address, 'Address')));
    cell(row, entry.wif, 'mono wif key-col');
    cell(row, undefined, 'btn key-col').append(button('Copy', () => copy(entry.wif, 'Private key')));
  });
}

function setPhraseVisible(visible) {
  $('phrase').classList.toggle('concealed', !visible);
  $('toggle-phrase').textContent = visible ? 'Hide' : 'Reveal';
}

function show(mnemonic) {
  const opts = options();
  const wallet = deriveWallet(mnemonic, opts);
  current = { mnemonic, wallet, network: opts.network };

  $('phrase').replaceChildren(...mnemonic.split(' ').map((word) => {
    const li = document.createElement('li');
    li.textContent = word;
    return li;
  }));
  setPhraseVisible(false);

  renderTable($('receive'), wallet.receive);
  renderTable($('change'), wallet.change);
  $('show-keys').checked = false;
  syncKeyColumns();

  $('xpub').textContent = wallet.accountXpub;
  $('path').textContent = `${wallet.accountPath}/0/i`;
  $('network-label').textContent = NETWORKS[opts.network].label + (opts.passphrase ? ' (with passphrase)' : '');

  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function syncKeyColumns() {
  const on = $('show-keys').checked;
  for (const id of ['receive', 'change']) $(id).classList.toggle('with-keys', on);
}

function clearAll() {
  current = null;
  for (const id of ['phrase', 'receive', 'change', 'xpub', 'path', 'network-label']) $(id).replaceChildren();
  $('restore-input').value = '';
  $('passphrase').value = '';
  $('restore-error').textContent = '';
  $('result').hidden = true;
  toast('Cleared from this page');
}

$('generate').addEventListener('click', () => {
  const words = Number(document.querySelector('input[name="words"]:checked').value);
  show(newMnemonic(words));
});

$('restore').addEventListener('click', () => {
  const mnemonic = normalizeMnemonic($('restore-input').value);
  const problem = checkMnemonic(mnemonic);
  $('restore-error').textContent = problem ?? '';
  if (!problem) show(mnemonic);
});
$('restore-input').addEventListener('input', () => { $('restore-error').textContent = ''; });

$('toggle-phrase').addEventListener('click', () => {
  setPhraseVisible($('phrase').classList.contains('concealed'));
});
$('copy-phrase').addEventListener('click', () => {
  if (current && confirm('Copying puts your recovery phrase on the clipboard, where other apps can read it. Continue?')) {
    copy(current.mnemonic, 'Recovery phrase');
  }
});
$('show-keys').addEventListener('change', (e) => {
  if (e.target.checked && !confirm('Private keys give full control of the coins at each address. Show them?')) {
    e.target.checked = false;
  }
  syncKeyColumns();
});
$('copy-xpub').addEventListener('click', () => current && copy(current.wallet.accountXpub, 'Watch-only key'));
$('print').addEventListener('click', () => print());
$('clear').addEventListener('click', clearAll);

// Changing options re-derives the wallet that is on screen
for (const id of ['network', 'count', 'passphrase']) {
  $(id).addEventListener('change', () => current && show(current.mnemonic));
}

// Closed <details> do not print; open them for the printout only
let reopened = [];
addEventListener('beforeprint', () => {
  reopened = [...document.querySelectorAll('#result details:not([open])')];
  for (const d of reopened) d.open = true;
});
addEventListener('afterprint', () => {
  for (const d of reopened) d.open = false;
});
