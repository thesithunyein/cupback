# Security policy

CupBack moves real money on Bitcoin Cash mainnet. We take security reports seriously.

## Reporting a problem

**Please do not open a public issue for security problems.**

Report it privately through GitHub: go to the **Security** tab of this repository and choose **Report a vulnerability** ([direct link](https://github.com/thesithunyein/cupback/security/advisories/new)).

Please include:
- what the problem is and what an attacker could do with it
- steps to reproduce it, ideally on Chipnet
- the commit or deployed URL you tested

You should get a reply within 3 days. We will keep you updated until it is fixed and credit you if you want.

## What is in scope

- The `CupDeposit` contract (`CupDeposit.cash`): any way to spend a deposit other than a full refund to the guest, or to refund it twice
- Transaction building and signing in `chain.js`: any way a wallet, server or link could change where money goes
- Event and receipt links: any way a crafted link could send a deposit or refund to the wrong place
- The deployed site at https://cupback.vercel.app

Out of scope: problems in third-party wallets, Electrum servers or the WizardConnect relay themselves, and social-engineering attacks on event staff.

## How CupBack is built to stay safe

- CupBack never holds deposits or private keys. Wallets sign every transaction.
- Each deposit is locked in its own contract that can only pay the guest the exact deposit amount.
- The app refuses a signed transaction if the wallet changed anything other than its own signature.
- Receipts are checked against the chain before staff approve a refund.

## Known limits

- The contract has not had an independent review yet.
- After the self-refund time, a guest can take back a deposit without returning the cup. This is by design.
- The app relies on public Electrum servers for chain data.

## Supported versions

Only the latest commit on `main`, which is what https://cupback.vercel.app runs.
