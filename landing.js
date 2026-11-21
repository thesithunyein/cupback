import { decodeCashAddress } from '@bitauth/libauth';

const oldLink = new URLSearchParams(location.hash.slice(1));
if (oldLink.has('event') || oldLink.has('receipt')) {
  location.replace(new URL('./app.html' + location.hash, location.href));
}

if (import.meta.env.VITE_BCH_NETWORK === 'mainnet') {
  for (const label of document.querySelectorAll('[data-mainnet-text]')) {
    label.textContent = label.dataset.mainnetText;
  }
  // Show mainnet evidence only when real transaction IDs are configured.
  const proofs = {
    deposit: import.meta.env.VITE_PROOF_DEPOSIT_TX?.trim(),
    refund: import.meta.env.VITE_PROOF_REFUND_TX?.trim(),
  };
  const valid = Object.values(proofs).every(id => /^[0-9a-f]{64}$/.test(id ?? ''));
  for (const link of document.querySelectorAll('[data-proof]')) {
    link.href = 'https://explorer.bitcoinunlimited.info/tx/' + proofs[link.dataset.proof];
  }
  if (!valid) document.querySelector('.network-proof')?.setAttribute('hidden', '');
}

const presentation = import.meta.env.VITE_BLAZE_PRESENTATION_URL || new URL('./cupback-presentation.pdf', location.href).href;
const votingAddress = import.meta.env.VITE_BLAZE_EMBER_ADDRESS?.trim();
const banner = document.querySelector('#blaze-banner');
if (banner && presentation && votingAddress) {
  const url = URL.canParse(presentation) ? new URL(presentation) : null;
  const address = decodeCashAddress(votingAddress);
  if (url?.protocol === 'https:' && typeof address !== 'string' &&
      address.prefix === 'bitcoincash' && address.type === 'p2pkhWithTokens') {
    banner.querySelector('[data-presentation]').href = url.href;
    const display = banner.querySelector('[data-ember]');
    display.textContent = votingAddress;
    display.title = votingAddress;
    display.setAttribute('aria-label', 'EMBER2026 voting address ' + votingAddress);
    const copy = banner.querySelector('[data-copy-ember]');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(votingAddress);
        copy.textContent = 'Copied ✓';
        setTimeout(() => { copy.textContent = 'Copy address'; }, 1800);
      } catch {
        // Clipboard blocked: show the full address selected so it can be copied by hand.
        getSelection()?.selectAllChildren(display);
      }
    });
    banner.hidden = false;
  }
}
