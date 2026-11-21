import './style.css';
import QRCode from 'qrcode';
import bchLogo from './bch.svg';
import cashonizeLogo from './cashonize.png';
import { depositSatoshis } from './amounts.js';
import { addressScript, network, startWallet, stopWallet, walletAddress, pay, lookup, findRefund, refund } from './chain.js';

const panel = document.querySelector('#panel');
const notice = document.querySelector('#notice');
const networkBadge = document.querySelector('#network');
const bchMark = document.createElement('img');
bchMark.src = bchLogo;
bchMark.alt = '';
bchMark.width = bchMark.height = 18;
bchMark.addEventListener('error', () => bchMark.remove());
networkBadge.append(bchMark, network === 'mainnet' ? 'Bitcoin Cash' : 'Chipnet');

const storageKey = 'cupback:receipts:' + network;
const eventStorageKey = 'cupback:events:' + network;
const idPattern = /^[0-9a-f]{64}$/;
const explorer = network === 'mainnet'
  ? 'https://explorer.bitcoinunlimited.info/tx/' : 'https://chipnet.chaingraph.cash/tx/';
let connected = false;
let busy = false;
let tab = 'deposit';
let receiptTimer;
let stopCamera;

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
  let url;
  try { url = new URL(value); }
  catch { throw Error('Paste the full CupBack link.'); }
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

function connect() {
  if (connected) return;
  const picker = element('dialog', '', 'wallet-picker');
  picker.setAttribute('aria-labelledby', 'wallet-picker-title');
  const title = element('h2', 'Choose your wallet');
  title.id = 'wallet-picker-title';
  const cancel = element('button', 'Cancel', 'secondary');
  cancel.type = 'button';
  cancel.onclick = () => picker.close();
  const option = (name, description, otherWallet) => {
    const choice = button('', () => {
      picker.close();
      return pairWallet(otherWallet);
    }, 'wallet-choice');
    if (!otherWallet) {
      const logo = element('img');
      logo.src = cashonizeLogo;
      logo.alt = '';
      logo.width = logo.height = 32;
      choice.append(logo);
    }
    const label = element('span', name);
    label.append(element('small', description));
    choice.append(label);
    return choice;
  };
  picker.append(title,
    option('Cashonize', 'Connect on this device or scan a code', false),
    option('Other WizardConnect wallet', 'Scan a connection QR code', true),
    cancel);
  picker.addEventListener('close', () => picker.remove(), { once: true });
  document.body.append(picker);
  picker.showModal();
}

function pairWallet(otherWallet) {
  if (connected) return;
  const pairing = element('section', '', 'wallet-pairing');
  const heading = element('h2', '', 'wallet-heading');
  const icon = element('img');
  icon.src = cashonizeLogo;
  icon.alt = '';
  icon.width = icon.height = 32;
  if (!otherWallet) heading.append(icon);
  heading.append(otherWallet ? 'Connect a WizardConnect wallet' : 'Connect with Cashonize');
  pairing.append(heading,
    element('p', otherWallet ? 'Scan the QR code from your wallet to connect to CupBack.'
      : 'Copy the link. In Cashonize, open Connect, paste it into Connection URI, and select Connect New dApp.', 'hint'));
  const code = element('img', '', 'qr');
  const link = element('a', 'Open Cashonize', 'button secondary');
  link.href = 'https://cashonize.com/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  code.alt = 'WizardConnect pairing QR code';
  const uri = startWallet(() => {
    connected = true;
    walletControl.hidden = false;
    const destination = panel.querySelector('[data-destination]');
    if (destination) destination.textContent = 'Refund wallet: ' + walletAddress();
    pairing.remove();
    notice.textContent = 'Wallet connected.';
    panel.querySelector('[data-connect]')?.remove();
    const payment = panel.querySelector('[data-wallet-action]');
    if (payment) { payment.hidden = false; payment.disabled = false; }
  });
  if (!uri) return;
  const actions = element('div', '', 'actions');
  const copy = button('Copy connection link', async () => {
    try {
      await navigator.clipboard.writeText(uri);
      copy.textContent = 'Connection link copied';
      notice.textContent = 'Paste the link in Cashonize’s Connect tab.';
    } catch {
      manual.hidden = false;
      requestAnimationFrame(() => uriInput.focus());
    }
  });
  const manual = element('label', 'Connection URI');
  manual.hidden = true;
  const uriInput = element('input');
  uriInput.readOnly = true;
  uriInput.value = uri;
  uriInput.addEventListener('focus', () => uriInput.select());
  manual.append(uriInput);
  actions.append(copy, link);
  const otherDevice = element('details');
  otherDevice.append(element('summary', 'Connect from another device'),
    element('p', 'Scan this code from a WizardConnect wallet.', 'hint'), code);
  if (otherWallet) pairing.append(code);
  else pairing.append(actions, manual, otherDevice);
  panel.querySelector('[data-pairing]')?.remove();
  pairing.dataset.pairing = '';
  panel.append(pairing);
  pairing.scrollIntoView({ block: 'nearest' });
  return QRCode.toDataURL(uri, {width: 340}).then(source => { code.src = source; });
}

function walletAction(text, action, container = panel) {
  if (!connected) {
    const connectButton = button('Connect wallet', connect);
    connectButton.dataset.connect = '';
    container.append(connectButton);
  }
  const actionButton = button(text, action);
  actionButton.dataset.walletAction = '';
  actionButton.hidden = !connected;
  actionButton.disabled = !connected;
  container.append(actionButton);
}

function readEvents() {
  try {
    const value = JSON.parse(localStorage.getItem(eventStorageKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveEvent(event) {
  const events = readEvents().filter(previous => makeLink('event', previous) !== makeLink('event', event));
  try {
    localStorage.setItem(eventStorageKey, JSON.stringify([event, ...events].slice(0, 15)));
    return true;
  } catch {
    return false;
  }
}

async function showPickupCode(event, saved = true) {
  const open = event.recovery * 1000 > Date.now();
  panel.replaceChildren(element('p', 'Pickup code', 'preview-label'),
    element('h2', event.name), element('p', formatAmount(event.amount), 'receipt-amount'),
    element('p', open ? 'Show this code where guests pick up cups.' : 'This event is closed.', 'hint'));
  if (!saved) panel.append(element('p', 'Save this link. This browser could not keep the event.', 'hint'));
  await share('event', event);
  const checkout = element('a', 'Open guest view', 'button secondary');
  checkout.href = makeLink('event', event);
  panel.append(checkout, button('Back to events', showSetup, 'secondary'));
}

function showSetup() {
  panel.innerHTML = '<h2>Set up an event</h2><p class="hint">Set a deposit and make a pickup QR code.</p>' +
    '<form class="event-form">' +
    '<fieldset><legend>Event details</legend>' +
    '<label>Event name<input name="name" required maxlength="60" placeholder="Saturday market"></label>' +
    '<div class="setup-fields">' +
    '<label>Deposit (BCH)<input name="amount" required inputmode="decimal" autocomplete="off" placeholder="0.001"></label>' +
    '<label>Self-refunds start<input name="recovery" type="datetime-local" required aria-describedby="refund-time-help"></label></div>' +
    '<p class="field-help" id="refund-time-help">After this time, guests can reclaim any unrefunded deposit without returning the cup.</p></fieldset>' +
    '<fieldset><legend>Refund approval</legend>' +
    '<label>Return booth address<input name="booth" required spellcheck="false" autocapitalize="none" autocomplete="off" aria-describedby="booth-help"></label>' +
    '<p class="field-help" id="booth-help">Paste the first receive address from the wallet staff will use to approve refunds.</p>' +
    '<details class="setup-optional"><summary>Add an organizer wallet (optional)</summary>' +
    '<label>Organizer address<input name="organizer" spellcheck="false" autocapitalize="none" autocomplete="off" aria-describedby="organizer-help"></label><p class="field-help" id="organizer-help">Use its first receive address to let this wallet approve refunds too.</p></details></fieldset>' +
    '<button class="setup-submit">Create pickup QR code</button></form>';
  const form = panel.querySelector('form');
  const preview = element('details', '', 'event-preview');
  const previewTitle = element('summary', 'Preview guest checkout');
  const previewEvent = element('h3', 'Your event');
  const previewAmount = element('p', 'Deposit amount', 'receipt-amount');
  preview.append(previewTitle, previewEvent, previewAmount,
    element('p', 'Pay at pickup. Get your deposit back when you return the cup.', 'hint'));
  const layout = element('div', '', 'setup-layout');
  form.before(layout);
  layout.append(form, preview);
  form.addEventListener('input', () => {
    previewEvent.textContent = form.elements.name.value.trim() || 'Your event';
    const amount = form.elements.amount.value;
    try { previewAmount.textContent = formatAmount(depositSatoshis(amount)); }
    catch { previewAmount.textContent = 'Deposit amount'; }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    for (const [name, validate] of [
      ['amount', depositSatoshis],
      ['booth', addressScript],
      ['organizer', value => { if (value) addressScript(value); }],
      ['recovery', value => {
        if (!(new Date(value).valueOf() > Date.now())) throw Error('Choose a future time.');
      }],
    ]) {
      const field = form.elements[name];
      try { validate(values[name].trim()); }
      catch (error) {
        field.setCustomValidity(error.message);
        field.reportValidity();
        field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
        return;
      }
    }
    run(async () => {
      const event = parseEvent({ ...values, amount: depositSatoshis(values.amount), name: values.name.trim(), booth: values.booth.trim(),
        organizer: values.organizer.trim() || values.booth.trim(), network, recovery: Math.floor(new Date(values.recovery).valueOf() / 1000) });
      if (event.recovery * 1000 <= Date.now()) throw Error('Choose a future recovery time.');
      await showPickupCode(event, saveEvent(event));
    });
  });

  const events = readEvents();
  if (events.length) {
    const list = element('section', '', 'recent-receipts');
    list.append(element('h3', 'Saved events'), element('p', 'Saved in this browser.', 'hint'));
    for (const saved of events) {
      try {
        const event = parseEvent(saved);
        const status = event.recovery * 1000 > Date.now() ? 'Open' : 'Closed';
        const savedEvent = button('', () => showPickupCode(event), 'secondary saved-event');
        savedEvent.append(element('span', event.name), element('span', status, 'saved-event-status'));
        list.append(savedEvent);
      } catch {
        // Ignore event records that cannot be opened on this network.
      }
    }
    panel.append(list);
  }
}

function showEntry(key) {
  const isEvent = key === 'event';
  const isStaff = tab === 'staff';
  panel.innerHTML = isEvent
    ? '<h2>Pay a cup deposit</h2><p class="hint">Scan the pickup code. Or paste the event link.</p>'
    : isStaff
      ? '<h2>Return booth</h2><p class="hint">Scan the guest’s receipt to check the deposit before approving a refund.</p>'
      : '<h2>Find a receipt</h2><p class="hint">Open a saved receipt or paste your receipt link.</p>';
  const form = element('form');
  const label = element('label', isEvent ? 'Event link' : 'Receipt link');
  const input = element('input');
  input.type = 'url';
  input.required = true;
  label.append(input);
  form.append(label, element('button', 'Open'));
  const open = value => run(async () => {
    const data = parseLink(value.trim(), key);
    stopCamera?.();
    if (isEvent) {
      const event = parseEvent(data);
      history.replaceState(null, '', makeLink('event', event));
      showEvent(event);
    } else {
      const receipt = parseReceipt(data);
      const url = new URL(makeLink('receipt', receipt));
      if (isStaff) url.searchParams.set('tab', 'staff');
      history.replaceState(null, '', url);
      await showReceipt(receipt);
    }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    open(input.value);
  });
  if (isStaff || isEvent) addScanner(open, isStaff ? 'Scan receipt' : 'Scan pickup code');
  panel.append(form);
  if (!isEvent && !isStaff) {
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

function addScanner(open, label) {
  const scanner = element('section', '', 'scanner');
  const video = element('video');
  video.playsInline = true;
  video.muted = true;
  video.hidden = true;
  const scan = element('button', label);
  scan.type = 'button';
  scan.onclick = async () => {
    if (stopCamera) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      notice.textContent = 'Use your phone’s camera app to scan the QR code, then paste the link below.';
      return;
    }
    let stream;
    let stopped = false;
    stopCamera = () => {
      stopped = true;
      stream?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
      video.hidden = true;
      scan.textContent = label;
      stopCamera = undefined;
    };
    const close = stopCamera;
    scan.textContent = 'Stop camera';
    notice.textContent = 'Requesting camera access…';
    try {
      const { default: decodeQr } = await import('jsqr');
      if (stopped) return;
      const canvas = document.createElement('canvas');
      const pixels = canvas.getContext('2d', { willReadFrequently: true });
      if (!pixels) throw Error('Camera preview unavailable.');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      if (stopped) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      video.srcObject = stream;
      video.hidden = false;
      await video.play();
      if (stopped) return;
      notice.textContent = 'Hold the QR code inside the camera view.';
      const check = () => {
        try {
          if (stopped) return;
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            window.setTimeout(check, 200);
            return;
          }
          const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          pixels.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = pixels.getImageData(0, 0, canvas.width, canvas.height);
          const code = decodeQr(frame.data, frame.width, frame.height);
          if (code) {
            close();
            void open(code.data);
          } else window.setTimeout(check, 200);
        } catch {
          if (stopped) return;
          close();
          notice.textContent = 'Could not read the QR code. Try again or paste the link.';
        }
      };
      check();
    } catch {
      if (stopped) return;
      close();
      notice.textContent = 'Camera unavailable. Scan with your phone’s camera app or paste the link.';
    }
  };
  scanner.append(scan, video);
  panel.append(scanner);
}

function showEvent(event) {
  const summary = element('section', '', 'deposit-summary');
  summary.append(element('p', 'Refundable cup deposit', 'preview-label'),
    element('h2', event.name), element('p', formatAmount(event.amount), 'receipt-amount'),
    element('p', 'Return your cup to get your deposit back.', 'hint'));
  const terms = element('details', '', 'deposit-terms');
  terms.append(element('summary', 'Refund details'),
    element('p', 'You can claim an unused deposit after '
      + new Date(event.recovery * 1000).toLocaleString() + '.', 'hint'));
  panel.replaceChildren(summary, terms);
  if (event.recovery * 1000 <= Date.now()) {
    panel.append(element('p', 'This event has closed.'));
    return;
  }
  const buyer = element('p', connected ? 'Refund wallet: ' + walletAddress() : '', 'details');
  buyer.dataset.destination = '';
  panel.append(buyer);
  walletAction('Pay deposit', async () => {
    notice.textContent = 'Open Cashonize to approve the deposit.';
    const receipt = await pay(event, pendingReceipt => {
      save(pendingReceipt);
      history.replaceState(null, '', makeLink('receipt', pendingReceipt));
    });
    await showReceipt(receipt);
  });
}

async function showReceipt(receipt, submittedId) {
  stopReceiptWatch();
  const isStaff = tab === 'staff';
  panel.replaceChildren(element('p', 'Return receipt', 'preview-label'), element('h2', receipt.event.name),
    element('p', formatAmount(receipt.event.amount), 'receipt-amount'));
  const status = element('p', submittedId ? 'Refund submitted' : 'Checking the deposit…', 'receipt-status');
  status.setAttribute('role', 'status');
  const statusBar = element('div', '', 'receipt-status-bar');
  statusBar.append(status, button('Refresh', () => showReceipt(receipt, submittedId), 'secondary'));
  panel.append(statusBar);
  const proof = element('details', '', 'deposit-terms');
  proof.append(element('summary', 'Transaction details'), txLink('View deposit transaction', receipt.txid));
  const controls = element('section', '', 'receipt-controls');
  const next = element('a', 'Scan next receipt', 'button secondary');
  next.href = './app.html?tab=staff';
  next.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy) return;
    history.replaceState(null, '', next.href);
    notice.textContent = '';
    setTab('staff');
  });
  const markRefunded = refundId => {
    if (status.dataset.result === 'paid') return;
    stopReceiptWatch();
    status.textContent = isStaff ? 'Already refunded' : 'Refunded';
    if (submittedId) status.textContent = 'Refunded';
    status.dataset.result = 'paid';
    proof.append(txLink('View refund transaction', refundId));
    controls.replaceChildren(element('p', 'Returned ' + formatAmount(receipt.event.amount) + ' to the guest wallet.', 'hint'));
    if (isStaff) controls.append(next);
  };
  if (!isStaff) await share('receipt', receipt);
  panel.append(controls, proof);
  if (submittedId) {
    controls.append(element('p', 'Checking that the refund appears on the network.', 'hint'));
    if (isStaff) controls.append(next);
  } else {
    try {
      const unspent = await lookup(receipt);
      if (unspent) {
        status.textContent = 'Ready to return';
        status.dataset.result = 'ready';
        if (isStaff) {
          controls.append(element('p', 'Check the cup before you approve the refund.', 'hint'));
          walletAction('Approve refund', () => sendRefund(receipt, false), controls);
        } else {
          controls.append(element('p', 'Show this receipt and your cup to staff.', 'hint'));
          const staff = element('a', 'Open in return booth', 'secondary');
          const staffUrl = new URL(makeLink('receipt', receipt));
          staffUrl.searchParams.set('tab', 'staff');
          staff.href = staffUrl;
          controls.append(staff);
          if (Date.now() >= receipt.event.recovery * 1000) {
            walletAction('Recover my deposit', () => sendRefund(receipt, true), controls);
          }
        }
      } else {
        status.textContent = 'Checking refund…';
        if (isStaff) controls.append(next);
      }
    } catch (error) {
      status.textContent = 'Could not check the deposit. Tap Refresh.';
      if (isStaff) controls.append(next);
      throw error;
    }
  }
  const checkRefund = async () => {
    const refundId = await findRefund(receipt);
    if (refundId) {
      if (status.isConnected) markRefunded(refundId);
      return true;
    }
    return false;
  };
  if (status.dataset.result !== 'ready' && await checkRefund().catch(() => false)) return;
  let checking = false;
  receiptTimer = setInterval(async () => {
    if (busy || checking || document.hidden || !status.isConnected) return;
    checking = true;
    try {
      await checkRefund();
    } catch {
      // Keep the last verified status when the network is temporarily unavailable.
    } finally {
      checking = false;
    }
  }, 12000);
}

async function sendRefund(receipt, recover) {
  const address = walletAddress();
  const authorized = recover ? [receipt.buyer] : [receipt.event.booth, receipt.event.organizer];
  if (!authorized.includes(address)) {
    throw Error(recover ? 'Connect the wallet that paid this deposit.' : 'Disconnect and connect this event’s return-booth wallet.');
  }
  notice.textContent = 'Open Cashonize to approve the refund.';
  const refundId = await refund(receipt, recover, id => save({ ...receipt, refundId: id }));
  notice.textContent = '';
  await showReceipt(receipt, refundId);
}

function setTab(next) {
  stopCamera?.();
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
    setTab(new URLSearchParams(location.search).get('tab') === 'staff' ? 'staff' : 'return');
    return run(() => showReceipt(parseReceipt(parseLink(location.href, 'receipt'))));
  }
  if (params.has('event')) {
    setTab('deposit');
    return run(() => showEvent(parseEvent(parseLink(location.href, 'event'))));
  }
  const requested = new URLSearchParams(location.search).get('tab');
  setTab(['setup', 'return', 'staff'].includes(requested) ? requested : 'deposit');
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
      current.hidden = true;
      current.disabled = true;
      const reconnect = button('Connect wallet', connect);
      reconnect.dataset.connect = '';
      current.before(reconnect);
    }
  }
}, 'secondary');
walletControl.hidden = true;
networkBadge.after(walletControl);
window.addEventListener('hashchange', openFromLocation);
window.addEventListener('pagehide', () => stopCamera?.());
openFromLocation();

