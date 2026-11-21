# CupBack

CupBack links a reusable-cup deposit to a BCH wallet. Any authorized return booth can approve the full refund from that original deposit. Its wallet pays the transaction fee. A refund can consume the deposit only once.

## Run locally

Use Node 22.12+ and run npm ci, then npm run dev. Run npm test for the local BCH VM checks and npm run build to create dist/. Serve dist/ over HTTPS for camera-based QR navigation and clipboard support. The default network is Chipnet.

## Deploy to Vercel

Import the GitHub repo as a Vercel project. Use the repository root and Node.js 22.x or 24.x. The checked-in vercel.json sets the Vite preset, npm ci, npm run build, and the dist output folder. Keep clean URLs off so /app.html and existing link URLs resolve.

No project environment variables are required for Chipnet. Open / for the landing page and /app.html for the app. On a new domain, create pickup and receipt links from that domain. Existing links should be opened on the domain that issued them.


## Chipnet checkout

1. Prepare separate WizardConnect wallets for the buyer, return booth, and organizer. Fund the buyer and the return booth with Chipnet BCH. The current wallet integration spends a single BCH coin per transaction. Deposit funding searches the first eight receive and change paths. Refund funding uses the wallet's first receive address.
2. Set up an event with the booth and organizer's first receive addresses, a deposit of at least 1,000 satoshis, and a future recovery time.
3. Open the pickup QR from the buyer device. Pair the buyer wallet, approve the deposit, and save the receipt URL.
4. Open the receipt from the booth device. Check the cup, pair the booth wallet, approve the refund, then refresh the receipt to verify both transactions.
5. Scan the receipt again. The chain should report the original refund. Confirm that the buyer received the entire principal and the booth spent only the network fee.

## Pilot limits

- Physical inspection is performed by staff. The chain verifies the approving wallet, full refund amount, and refund destination.
- Buyers can recover an unspent deposit after the event's published recovery time, even if the cup was never returned. This makes the deposit a temporary hold. An organizer must accept this policy before offering it to customers.
- Event links come from the organizer and carry public configuration. Receipts carry the public deposit details used to reconstruct the contract. Save or share a receipt link across devices. Recent history on a single device is stored in that browser.
- The browser uses Electrum and WizardConnect relay services. A compatible app and live connectivity are required.
- There is no shared organizer ledger. Deployment does not establish support for a real-wallet transaction, operator adoption, or prize eligibility.

The application has a separate mainnet build configuration. Before enabling it, verify funded Chipnet pairing, broadcast, refund and recovery with two real wallets, review the money-handling and event policy, and independently review the covenant. No private keys are needed by CupBack.
