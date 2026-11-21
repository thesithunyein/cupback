import './style.css';
import QRCode from 'qrcode';
import { addressScript, network, startWallet, stopWallet, walletAddress, pay, lookup, findRefund, refund } from './chain.js';

const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const networkBadge = document.querySelector('#network');
networkBadge.textContent = network === 'mainnet' ? 'Bitcoin Cash' : 'Chipnet';

const storageKey = 'cupback:receipts:' + network;
const idPattern = /^[0-9a-f]{64}$/;
const explorer = network === 'mainnet'
  ? 'https://explorer.bitcoinunlimited.info/tx/' : 'https://chipnet.chaingraph.cash/tx/';
let connected = false;
let busy = false;
let tab = 'deposit';
let receiptTimer;

function stopReceiptWatch() {
  clearInterval(receiptTimer);
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
  catch { return {}; }
}

function save(receipt) {
  const receipts = loadSaved();
  receipts[receipt.txid] = receipt;
  localStorage.setItem(storageKey, JSON.stringify(receipts));
}

function parseEvent(event) {
  if (!event || event.network !== network || typeof event.name !== 'string' ||
      !event.name.trim() || event.name.length > 60 ||
      typeof event.amount !== 'string' || !/^[0-9]{4,9}$/.test(event.amount) ||
      !Number.isSafeInteger(event.recovery) || event.recovery < 500000000 ||
      event.recovery > 0xffffffff) throw Error('This event link is invalid or uses a different network.');
  addressScript(event.booth);
  addressScript(event.organizer);
  return event;
}

function parseReceipt(receipt) {
  if (!receipt || !idPattern.test(receipt.txid) || !/^[a-f0-9]{32}$/.test(receipt.nonce)) {
    throw Error('This receipt is invalid.');
  }
  parseEvent(receipt.event);
  addressScript(receipt.buyer);
  return receipt;
}

function parseLink(value, key) {
  const url = new URL(value);
  const encoded = new URLSearchParams(url.hash.slice(1)).get(key);
  if (url.origin !== location.origin || !encoded || encoded.length > 4096) {
    throw Error('Paste the CupBack link from this site.');
  }
  try { return JSON.parse(encoded); }
  catch { throw Error('This link is incomplete. Ask for a new copy.'); }
}

function makeLink(key, data) {
  const url = new URL('./app.html', location.href);
  url.hash = new URLSearchParams({[key]: JSON.stringify(data)});
  return url.href;
}

function formatAmount(amount) {
  const value = BigInt(amount);
  const decimals = (value % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return (value / 100000000n).toString() + (decimals ? '.' + decimals : '') + ' BCH';
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, fn, className) {
  const node = element('button', text, className);
  node.type = 'button';
  node.addEventListener('click', () => run(fn));
  return node;
}

async function run(fn) {
  if (busy) return;
  busy = true;
  panel.inert = true;
  notice.textContent = '';
  try { await fn(); }
  catch (error) { notice.textContent = error instanceof Error ? error.message : 'Try again.'; }
  finally { busy = false; panel.inert = false; }
}

function txLink(label, txid) {
  const link = element('a', label);
  link.href = explorer + txid;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

async function share(key, data) {
  const link = makeLink(key, data);
  const section = element('section', '', 'share-card');
  const image = element('img', '', 'qr');
  image.alt = key === 'event' ? 'QR code for this event' : 'QR code for this receipt';
  image.src = await QRCode.toDataURL(link, { width: 340, margin: 2, errorCorrectionLevel: 'L' });
  const label = element('label', key === 'event' ? 'Event link' : 'Receipt link');
  const input = element('input');
  input.readOnly = true;
  input.value = link;
  input.addEventListener('focus', () => input.select());
  label.append(input);
  const linkTools = element('div', '', 'link-tools');
  linkTools.append(label, button('Copy link', async () => {
    await navigator.clipboard.writeText(link);
    notice.textContent = 'Link copied.';
  }, 'secondary'));
  section.append(image, linkTools);
  panel.append(section);
}

function connect(action) {
  if (connected) return action();
  const pairing = element('section');
  pairing.append(element('h2', 'Connect your wallet'),
    element('p', 'Scan this code from a WizardConnect wallet, such as Cashonize.', 'hint'));
  const code = element('img', '', 'qr');
  const link = element('a', 'Open wallet');
  code.alt = 'WizardConnect pairing QR code';
  const uri = startWallet(() => {
    connected = true;
    walletControl.hidden = false;
    const destination = panel.querySelector('[data-destination]');
    if (destination) destination.textContent = 'Refund wallet: ' + walletAddress();
    pairing.remove();
    notice.textContent = 'Wallet connected.';
    panel.querySelector('[data-connect]')?.remove();
    if (panel.querySelector('[data-wallet-action]')) panel.querySelector('[data-wallet-action]').disabled = false;
  });
  if (!uri) return action();
  link.href = uri;
  pairing.append(code, link);
  panel.querySelector('[data-pairing]')?.remove();
  pairing.dataset.pairing = '';
  panel.append(pairing);
  return QRCode.toDataURL(uri, {width: 340}).then(source => { code.src = source; });
}

function walletAction(text, action, container = panel) {
  if (!connected) {
    const connectButton = button('Connect wallet', () => connect(action), 'secondary');
    connectButton.dataset.connect = '';
    container.append(connectButton);
  }
  const actionButton = button(text, action);
  actionButton.dataset.walletAction = '';
  actionButton.disabled = !connected;
  container.append(actionButton);
}

function showSetup() {
  panel.innerHTML = '<h2>Set up your event</h2><p class="hint">Choose who can approve returns.</p>' +
    '<form><label>Event name<input name="name" required maxlength="60" placeholder="Saturday market"></label>' +
    '<div class="grid"><label>Deposit (sats)<input name="amount" required type="number" min="1000" max="999999999" step="1" placeholder="10000"></label>' +
    '<label>Recovery opens<input name="recovery" type="datetime-local" required></label></div>' +
    '<label>Return booth wallet address<input name="booth" required spellcheck="false"></label>' +
    '<label>Organizer wallet address<input name="organizer" required spellcheck="false"></label>' +
    '<p class="hint">Use each wallet’s first receive address. After this time, customers can recover unused deposits.</p>' +
    '<button>Create event link</button></form>';
  const form = panel.querySelector('form');
  const preview = element('aside', '', 'event-preview');
  preview.setAttribute('aria-label', 'Customer pickup preview');
  const previewTitle = element('p', 'Customer view', 'preview-label');
  const previewEvent = element('h3', 'Your event');
  const previewAmount = element('p', 'Set the deposit', 'receipt-amount');
  preview.append(previewTitle, previewEvent, previewAmount,
    element('p', 'Pay at pickup. Return your cup to get your deposit back.', 'hint'));
  const layout = element('div', '', 'setup-layout');
  form.before(layout);
  layout.append(form, preview);
  form.addEventListener('input', () => {
    previewEvent.textContent = form.elements.name.value.trim() || 'Your event';
    const amount = form.elements.amount.value;
    previewAmount.textContent = /^[0-9]{4,9}$/.test(amount) ? formatAmount(amount) : 'Set the deposit';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    run(async () => {
      const event = parseEvent({ ...values, name: values.name.trim(), booth: values.booth.trim(),
        organizer: values.organizer.trim(), network, recovery: Math.floor(new Date(values.recovery).valueOf() / 1000) });
      if (event.recovery * 1000 <= Date.now()) throw Error('Choose a future recovery time.');
      panel.replaceChildren(element('h2', event.name), element('p', 'Show this QR code at pickup.'));
      await share('event', event);
    });
  });
}

function showEntry(key) {
  const isEvent = key === 'event';
  panel.innerHTML = isEvent
    ? '<h2>Pay a cup deposit</h2><p class="hint">Scan the pickup QR or paste the event link.</p>'
    : '<h2>Find a receipt</h2><p class="hint">Scan your receipt QR or paste the link.</p>';
  const form = element('form');
  const label = element('label', isEvent ? 'Event link' : 'Receipt link');
  const input = element('input');
  input.type = 'url';
  input.required = true;
  label.append(input);
  form.append(label, element('button', 'Open'));
  form.addEventListener('submit', e => {
    e.preventDefault();
    run(async () => {
      const data = parseLink(input.value.trim(), key);
      if (isEvent) {
        const event = parseEvent(data);
        history.replaceState(null, '', makeLink('event', event));
        showEvent(event);
      } else {
        const receipt = parseReceipt(data);
        history.replaceState(null, '', makeLink('receipt', receipt));
        await showReceipt(receipt);
      }
    });
  });
  panel.append(form);
  if (!isEvent) {
    const recent = Object.values(loadSaved()).reverse().slice(0, 10);
    if (recent.length) {
      const list = element('section', '', 'recent-receipts');
      list.append(element('h3', 'Recent deposits'));
      for (const item of recent) {
        const open = button(item.event.name + ' · ' + formatAmount(item.event.amount), () => {
          const receipt = parseReceipt(item);
          history.replaceState(null, '', makeLink('receipt', receipt));
          return showReceipt(receipt);
        }, 'secondary');
        list.append(open);
      }
      panel.append(list);
    }
  }
}

function showEvent(event) {
  panel.replaceChildren(element('p', 'Cup deposit', 'preview-label'), element('h2', event.name), element('p', formatAmount(event.amount), 'receipt-amount'),
    element('p', 'Return the cup to get your deposit back.'),
    element('p', 'You can recover your deposit after ' + new Date(event.recovery * 1000).toLocaleString()
      + '. Use a link supplied by event staff.', 'hint'));
  if (event.recovery * 1000 <= Date.now()) {
    panel.append(element('p', 'This event has closed.'));
    return;
  }
  const buyer = element('p', connected ? 'Refund wallet: ' + walletAddress() : '', 'details');
  buyer.dataset.destination = '';
  panel.append(buyer);
  walletAction('Pay deposit', async () => {
    notice.textContent = 'Approve the deposit in your wallet.';
    const receipt = await pay(event, pendingReceipt => {
      save(pendingReceipt);
      history.replaceState(null, '', makeLink('receipt', pendingReceipt));
    });
    await showReceipt(receipt);
  });
}

async function showReceipt(receipt) {
  stopReceiptWatch();
  panel.replaceChildren(element('p', 'Return receipt', 'preview-label'), element('h2', receipt.event.name),
    element('p', formatAmount(receipt.event.amount), 'receipt-amount'),
    txLink('View deposit transaction', receipt.txid));
  const status = element('p', 'Checking the deposit…', 'receipt-status');
  status.setAttribute('role', 'status');
  const statusBar = element('div', '', 'receipt-status-bar');
  statusBar.append(status, button('Refresh', () => showReceipt(receipt), 'secondary'));
  panel.append(statusBar);
  await share('receipt', receipt);
  const unspent = await lookup(receipt).catch(error => {
    status.textContent = 'Deposit not verified. Try refreshing.';
    throw error;
  });
  if (!unspent) {
    status.textContent = 'Deposit already spent.';
    const refundId = await findRefund(receipt);
    if (refundId) {
      status.textContent = 'Refunded';
      status.dataset.result = 'paid';
      panel.append(txLink('View refund transaction', refundId));
    }
    return;
  }
  status.textContent = 'Ready to return';
  status.dataset.result = 'ready';
  panel.append(element('p', 'Show this receipt and your cup to staff.', 'hint'));
  const staff = element('details', '', 'staff-tools');
  staff.append(element('summary', 'Staff: approve a return'),
    element('p', 'Check the cup before you approve.', 'hint'));
  walletAction('Approve refund', () => sendRefund(receipt, false), staff);
  panel.append(staff);
  if (Date.now() >= receipt.event.recovery * 1000) {
    panel.append(button('Recover my deposit', () => connect(() => sendRefund(receipt, true)), 'secondary'));
  }
  let checking = false;
  receiptTimer = setInterval(async () => {
    if (busy || checking || document.hidden || !status.isConnected) return;
    checking = true;
    try {
      const refundId = await findRefund(receipt);
      if (!refundId || busy || !status.isConnected) return;
      stopReceiptWatch();
      status.textContent = 'Refunded';
      status.dataset.result = 'paid';
      const proof = txLink('View refund transaction', refundId);
      status.after(proof);
      staff.remove();
      for (const control of panel.querySelectorAll('button')) {
        if (control.textContent === 'Recover my deposit') control.remove();
      }
    } catch {
      // Keep the last verified status when the network is temporarily unavailable.
    } finally {
      checking = false;
    }
  }, 12000);
}

async function sendRefund(receipt, recover) {
  notice.textContent = 'Approve the refund in your wallet.';
  await refund(receipt, recover, refundId => save({ ...receipt, refundId }));
  await showReceipt(receipt);
}

function setTab(next) {
  stopReceiptWatch();
  tab = next;
  document.querySelectorAll('[data-tab]').forEach(node =>
    node.setAttribute('aria-current', String(node.dataset.tab === tab)));
  if (tab === 'setup') showSetup();
  else showEntry(tab === 'deposit' ? 'event' : 'receipt');
}

function openFromLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('receipt')) {
    setTab('return');
    return run(() => showReceipt(parseReceipt(parseLink(location.href, 'receipt'))));
  }
  if (params.has('event')) {
    setTab('deposit');
    return run(() => showEvent(parseEvent(parseLink(location.href, 'event'))));
  }
  const requested = new URLSearchParams(location.search).get('tab');
  setTab(requested === 'setup' || requested === 'return' ? requested : 'deposit');
}

document.querySelectorAll('[data-tab]').forEach(node => node.addEventListener('click', () => {
  if (busy) return;
    const url = new URL('./app.html', location.href);
    if (node.dataset.tab !== 'deposit') url.searchParams.set('tab', node.dataset.tab);
    history.replaceState(null, '', url);
    notice.textContent = '';
    setTab(node.dataset.tab);
}));
const walletControl = button('Disconnect wallet', async () => {
  try { await stopWallet(); }
  finally {
    connected = false;
    walletControl.hidden = true;
    const destination = panel.querySelector('[data-destination]');
    if (destination) destination.textContent = '';
    const current = panel.querySelector('[data-wallet-action]');
    if (current) {
      current.disabled = true;
      const reconnect = button('Connect wallet', () => connect(() => {}), 'secondary');
      reconnect.dataset.connect = '';
      current.before(reconnect);
    }
  }
}, 'secondary');
walletControl.hidden = true;
networkBadge.after(walletControl);
window.addEventListener('hashchange', openFromLocation);
openFromLocation();

