# Contributing to CupBack

Thanks for helping. Small, focused changes are easiest to review.

## Get started

```bash
git clone https://github.com/thesithunyein/cupback
cd cupback
npm ci
npm run dev     # runs on Chipnet, the Bitcoin Cash test network
npm test        # contract and amount tests
```

Use a Chipnet wallet (for example a Cashonize development wallet) and free test BCH when you develop. Never test new code with real funds first.

## Before you open a pull request

- Run `npm test` and `npm run build`. Both must pass.
- If you change `CupDeposit.cash`, add or update tests in `contract.test.mjs` and explain the change in the pull request.
- Keep text in the app short and plain. One idea per sentence.
- Check your change on a phone-sized screen.
- Do not add new dependencies without a clear reason.

## Reporting bugs

Open an issue with:
- what you did
- what you expected
- what happened instead (a screenshot helps)
- the network (Chipnet or mainnet) and your wallet

Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Code of conduct

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
