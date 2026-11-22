# CupBack on XO

This folder migrates CupBack's cup-deposit covenant to an [XO](https://stack.xo.cash) template, so any XO wallet can pay a cup deposit, refund it at a booth, or recover it after the event.

- Original project: https://cupback.vercel.app (CashScript + WizardConnect, live on BCH mainnet)
- Original contract: [`../CupDeposit.cash`](../CupDeposit.cash)
- XO template: [`cupback.template.json`](cupback.template.json) (import this into an XO wallet) and the same template as TypeScript in [`cupback.template.ts`](cupback.template.ts)

## What the template does

| Action | Who | What happens on chain |
|---|---|---|
| `deposit` (start action) | Guest | Locks the cup deposit in a `CupDeposit` covenant output. |
| `refund` (follow-up) | Guest asks, booth approves | Spends the deposit with the booth's coin as input 1. The covenant forces output 0 to pay the guest the full deposit. The booth pays the fee. |
| `recover` (follow-up) | Guest | After the self-refund time, the guest spends the deposit back to themselves (CLTV). |

The covenant is the same compiled `CupDeposit` bytecode that the CupBack app uses (CashScript 0.14). The template rebuilds the redeem script exactly like CashScript does: the constructor arguments are pushed in reverse order (`receiptId`, `recoveryTime`, `organizerLockingScript`, `boothLockingScript`, `guestLockingScript`), followed by the contract bytecode. It is wrapped as P2SH32 by hand (`lockingType: p2s`), the same way the official `faucet.cash` template wraps its contract.

Unlocking scripts follow CashScript's function selector:

- refund: `<receiptId> <0> <redeem>`
- recover: `<receiptId> <1> <redeem>`

## Variables

| Variable | Type | Meaning |
|---|---|---|
| `depositSatoshis` | satoshis | Cup deposit (min. 1000) |
| `receiptId` | bytes (16) | Random receipt ID; makes every deposit a unique, single-use contract |
| `recoveryTime` | integer | Unix time after which the guest may self-refund |
| `guestLockingScript` | locking_script | Where the refund goes (guest P2PKH) |
| `boothLockingScript` | locking_script | Booth wallet allowed to approve refunds |
| `organizerLockingScript` | locking_script | Second wallet allowed to approve refunds (use the booth's if none) |

## Live on BCH mainnet

Every action of the template has been run through invitations in the XO debug tool, on **mainnet**, with real BCH. All signed invitations are exported in [`invitations/`](invitations/).

| # | Action | Invitation | Transaction |
|---|---|---|---|
| 1 | `deposit` (template v1) | [`1-deposit-v1.json`](invitations/1-deposit-v1.json) | [`7b347d2e…52fb9fc2a`](https://blockchair.com/bitcoin-cash/transaction/7b347d2e6939ba964399d1e2f3da261263c66e389da367a56c120ac52fb9fc2a) |
| 2 | `refund`, spends #1 | [`2-refund.json`](invitations/2-refund.json) | [`b4db6f23…1890afdbb`](https://blockchair.com/bitcoin-cash/transaction/b4db6f2345c6dcd2299947d09337eeb5cb7310b1c3b7c59c1d2e6611890afdbb) |
| 3 | `deposit` | [`3-deposit-v2.json`](invitations/3-deposit-v2.json) | [`0c1ab002…175aad4cf`](https://blockchair.com/bitcoin-cash/transaction/0c1ab002e30d2266dbe5b3e42c1424b2eccb469963d198255ae502c175aad4cf) |
| 4 | `recover`, spends #3 | [`4-recover.json`](invitations/4-recover.json) | [`61e253b6…a85367e17`](https://blockchair.com/bitcoin-cash/transaction/61e253b6d4665bcf42f6f227c0d63db4328e35f553d7ff771a075a3a85367e17) |

- Template ID (current, v2): `dd178bd48f3c3a12b536e0cc96ef0690e157873385d174ad1eac7c07194bf0c0`
- Deposit #1 was made with v1 (`5e8bb27e…67d5b4e`). v1 did not ask the guest for the deposit variables in `refund` and `recover`, so XO could not rebuild the unlocking script for those follow-ups. v2 adds those requirements and changes nothing else; the covenant bytecode is identical, which is why the v2 `refund` could spend the v1 deposit.
- In this run one wallet plays guest, booth and organizer, so all three locking scripts are the same P2PKH (`76a91477cfada5dd4742d66de8a0a87a160fbf4e76f33f88ac`). In a real event they are three different wallets.

### Values used

| Variable | Run 1–2 | Run 3–4 |
|---|---|---|
| `depositSatoshis` | 2000 | 2000 |
| `receiptId` | `5b52dbfca8285f307580614f40a99de8` | `5117cfcc7a1a7034cfe9741f9d5c9ba3` |
| `recoveryTime` | 1795296213 | 1795308381 (already past, so `recover` is spendable at once) |
| covenant locking bytecode | `aa20394c…3714f52987` | `aa200dd0…56ef17b887` |

## Reproduce

1. Open https://blaze.xo.cash and create an account (mainnet, or chipnet for test coins).
2. **Settings → Defaults**: set Receive, Change and Address to **Wallet (P2PKH)**. Fund the receive address with a few thousand satoshis.
3. **Import Template** and paste [`cupback.template.json`](cupback.template.json).
4. **Create Invitation → CupBack → Pay cup deposit**. Use **Paste JSON** for the six variables, **Set up output** for the deposit, **Add input** from the wallet, **Add change**, **Sign**, then **Create and broadcast**.
5. Refund: start a `refund` invitation (**Join Invitation** with `{"invitationIdentifier":"<random 32 hex>","templateIdentifier":"dd178bd4…","actionIdentifier":"refund","createdAtTimestamp":<ms>,"commits":[]}`). Join as **Guest**, paste the same variables, join as **Return booth**. **Set up input** → paste the covenant locking bytecode → **Fetch UTXOs** → pick the deposit. **Set up output**, then **Add input** with one coin from the booth (or organizer) address, **Add change**, **Sign**, broadcast.
6. Recover: same as step 5 with `"actionIdentifier":"recover"`, Guest only, and input 1 must be a coin from the **guest** address (the covenant checks it). The transaction locktime is `recoveryTime`.
7. To inspect, **Join Invitation** with any file from [`invitations/`](invitations/), or open the transactions above in **Inspect**.

## Verified: XO builds the same contract as CashScript

- `cupDepositContract` in the template is byte-for-byte the `bytecode` of [`../contract.json`](../contract.json) (cashc 0.14.0).
- Taking the redeem script out of the mainnet unlocking bytecode and hashing it with HASH256 gives exactly the covenant locking bytecode of both deposits (`aa20394c…`, `aa200dd0…`).
- Both spending paths passed consensus on mainnet: `refund` (booth approval, full amount forced to the guest) and `recover` (CLTV after `recoveryTime`).
