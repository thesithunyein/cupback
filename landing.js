import { decodeCashAddress } from '@bitauth/libauth';

const oldLink = new URLSearchParams(location.hash.slice(1));
if (oldLink.has('event') || oldLink.has('receipt')) {
  location.replace(new URL('./app.html' + location.hash, location.href));
}

if (import.meta.env.VITE_BCH_NETWORK === 'mainnet') {
  for (const label of document.querySelectorAll('[data-mainnet-text]')) {
    label.textContent = label.dataset.mainnetText;
  }
}

const presentation = import.meta.env.VITE_BLAZE_PRESENTATION_URL || new URL('./deck.pdf', location.href).href;
const votingAddress = import.meta.env.VITE_BLAZE_EMBER_ADDRESS?.trim();
const banner = document.querySelector('#blaze-banner');
if (banner && presentation && votingAddress) {
  const url = URL.canParse(presentation) ? new URL(presentation) : null;
  const address = decodeCashAddress(votingAddress);
  if (url?.protocol === 'https:' && typeof address !== 'string' &&
      address.prefix === 'bitcoincash' && address.type === 'p2pkhWithTokens') {
    banner.querySelector('[data-presentation]').href = url.href;
    const addressInput = banner.querySelector('input');
    addressInput.value = votingAddress;
    addressInput.addEventListener('focus', () => addressInput.select());
    banner.hidden = false;
  }
}
