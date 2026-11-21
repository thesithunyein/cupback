# CupBack release validation

## Mainnet acceptance

Build a separate preview with `VITE_BCH_NETWORK=mainnet`. Keep the public Chipnet site available until the mainnet flow is verified. Use two dedicated, separately controlled Cashonize wallets. Use a small agreed deposit and fund the booth's first receive address for refund fees. Record only public addresses and transaction IDs.

1. Create an event with the booth's first receive address and a future recovery time. Save the pickup link.
2. On a fresh browser on the guest phone, open the pickup link. Connect Cashonize, verify the guest wallet is active, approve payment, and save the receipt.
3. On another phone, open Return booth. Scan the receipt, connect the booth wallet, and approve the refund in Cashonize.
4. Reopen the receipt on the guest phone. Verify the refund spends the original deposit and returns its full amount. Repeat twice without reconnecting the booth wallet.
5. Scan a refunded receipt again. Expect **Already refunded** without a new signing request. Reopen the pickup link from a fresh browser to confirm it works for a judge.

Use Chipnet to rehearse the wrong wallet, rejected signature, temporary network loss, and recovery before and after the time threshold. Confirm recovery does not depend on the organizer or the original browser. The local tests cover the spending rules and ambiguous broadcast, but do not exercise phone cameras or wallet prompts.

## Operator pilot

Invite a venue or market organizer who currently manages reusable cups. Ask how deposits and exceptions are handled today, who staffs the return point, and what a successful change would look like. Have a first-time staff member perform three returns and one repeat scan without coaching. Record time from receipt presentation to approval, any help required, and the operator's exact feedback. Ask separately for permission before naming the venue or publishing any recordings.

Ask who would buy the product and what budget it would come from. Compare the result against the organizer's current process before proposing pricing. Keep timed rehearsals separate from live event results.

## Submission checks

- Publish the presentation and confirm it opens without authentication.
- Configure the public, token-aware EMBER2026 receiving address and verify the homepage banner shows it alongside the presentation and source links.
- Add the verified mainnet pickup link to DoraHacks. Include evidence links, with the network marked on each.
- Confirm Telegram check-in and roll-call status with the organizer. Live Showcase participation is optional.

## Current evidence

- [Mainnet solo deposit](https://blockchair.com/bitcoin-cash/transaction/0067f9705f54cc2dbc9821d39d48380000e081f8f9db55dccdefa7601eefa28b)
- [Mainnet solo refund](https://blockchair.com/bitcoin-cash/transaction/b1e866ad97b2ccd4c496b4735e577f93692a5105e8d0963702a63441e5f9aa85)

- [Chipnet guest deposit](https://chipnet.chaingraph.cash/tx/e984eef0fcd103acbfd3f0d2d6cd9defe2a229c57aa96728c86f05d8393357f9)
- [Chipnet booth refund](https://chipnet.chaingraph.cash/tx/870d237a4690c23311d7609d568ae153507e7e04550b5dd45face54be5de3138)

A separate booth wallet approved the refund and the guest received all 2,000 satoshis. Mainnet, the current two-phone workflow, independent covenant review, and a venue pilot are pending.
