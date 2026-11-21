# CupBack

CupBack links a reusable-cup deposit to a BCH wallet. Any authorized return booth can approve the full refund from that original deposit. Its wallet pays the transaction fee. A refund can consume the deposit only once.

[Open CupBack on Bitcoin Cash mainnet](https://cupback.vercel.app/app.html) · [Try the 1-minute solo demo](https://cupback.vercel.app/app.html#solo)

## Run locally

Use Node 22.12+ and run npm ci, then npm run dev. Run npm test for the local BCH VM checks and npm run build to create dist/. Serve dist/ over HTTPS for camera-based QR navigation and clipboard support. The default network is Chipnet.

## Deploy to Vercel

Import the GitHub repo as a Vercel project. Use the repository root and Node.js 22.x or 24.x. The checked-in vercel.json sets the Vite preset, npm ci, npm run build, and the dist output folder. Keep clean URLs off so /app.html and existing link URLs resolve.

No project environment variables are required for Chipnet. Production sets `VITE_BCH_NETWORK=mainnet`; set `VITE_PROOF_DEPOSIT_TX` and `VITE_PROOF_REFUND_TX` to mainnet transaction IDs to show the evidence section on the landing page. Open / for the landing page and /app.html for the app. On a new domain, create pickup and receipt links from that domain. Existing links should be opened on the domain that issued them.

The BLAZE presentation is served at /deck.pdf. Set `VITE_BLAZE_EMBER_ADDRESS` to the team's token-aware Bitcoin Cash mainnet receiving address to enable the submission banner. `VITE_BLAZE_PRESENTATION_URL` can override the bundled PDF with another HTTPS presentation URL.

Use `VITE_BCH_NETWORK=mainnet` for a separate mainnet preview. See [release validation](VALIDATION.md) for the wallet, booth, and on-chain acceptance checks.


## Chipnet checkout

1. Prepare separate WizardConnect wallets for the guest and return booth. Fund the buyer and the return booth with Chipnet BCH. The current wallet integration spends a single BCH coin per transaction. Deposit funding searches the first eight receive and change paths. Refund funding uses the wallet's first receive address.
2. Set up an event with the booth wallet's first receive address, a deposit of at least 0.00001 BCH, and a future time for self-refunds. Leave the organizer wallet blank if only the booth approves refunds. The event stays in this browser. Save the pickup link to open it elsewhere.
3. Open the pickup QR from the buyer device. Pair the buyer wallet, approve the deposit, and save the receipt URL.
4. Open **Return booth** from the booth device. Scan the guest’s receipt or paste its link. Check the cup, pair the booth wallet, and approve the refund in Cashonize.
5. Scan the receipt again. The chain should report the original refund. Confirm that the buyer received the entire principal and the booth spent only the network fee.

## Verified Chipnet browser test

On November 21, 2026, a guest paid a 2,000-satoshi deposit from Cashonize using WizardConnect. Staff opened the receipt and approved the return with a separate Cashonize booth wallet. The CupBack receipt changed from **Ready to return** to **Refunded**.

- [Guest deposit transaction](https://chipnet.chaingraph.cash/tx/e984eef0fcd103acbfd3f0d2d6cd9defe2a229c57aa96728c86f05d8393357f9)
- [Staff refund transaction](https://chipnet.chaingraph.cash/tx/870d237a4690c23311d7609d568ae153507e7e04550b5dd45face54be5de3138)

The refund spent output 0 of the original deposit and returned all 2,000 satoshis to the guest. The booth wallet covered the network fee.

## Pilot limits

- Physical inspection is performed by staff. The chain verifies the approving wallet, full refund amount, and refund destination.
- Buyers can recover an unspent deposit after the event's published recovery time, even if the cup was never returned. This makes the deposit a temporary hold. An organizer must accept this policy before offering it to customers.
- Event links come from the organizer and carry public configuration. Receipts carry the public deposit details used to reconstruct the contract. Save or share a receipt link across devices. Recent history on a single device is stored in that browser.
- The browser uses Electrum and WizardConnect relay services. A compatible app and live connectivity are required.
- Event and receipt history is local to each browser. Staff can hand off a receipt using its link or QR code.

The application has a separate mainnet build configuration. Before enabling it, verify timed recovery with a funded wallet, review the money-handling and event policy, and get an independent covenant review. Mainnet validation and a live event pilot are pending. No private keys are needed by CupBack.

## Verified mainnet solo demo (November 21, 2026)

One Cashonize wallet paid a 1,000-satoshi deposit and approved its own refund as the return booth. The full deposit came back.

- [Mainnet deposit](https://explorer.bitcoinunlimited.info/tx/0067f9705f54cc2dbc9821d39d48380000e081f8f9db55dccdefa7601eefa28b)
- [Mainnet refund](https://explorer.bitcoinunlimited.info/tx/b1e866ad97b2ccd4c496b4735e577f93692a5105e8d0963702a63441e5f9aa85)

## Solo demo

One wallet can try the whole flow. "Start the demo" creates a 0.00001 BCH event where the connected wallet is the guest and the return booth. The deposit transaction also sends 2,000 satoshis back to the wallet's first receive address so the same wallet can pay the refund fee. The wallet needs one balance entry of at least 0.000039 BCH.

Recovery uses a timestamp locktime, which the network compares with the median time of the last 11 blocks (about an hour behind the wall clock). The app checks that median before building a recovery transaction.
