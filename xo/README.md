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

## Reproduce the invitations

1. Open the XO debug tool at https://blaze.xo.cash and create a **chipnet** account.
2. Set the default receive policy to **Wallet (P2PKH)** and fund the receive address with test BCH (tbch.googol.cash or chipnet.bch.ninja).
3. **Import Template**, then paste [`cupback.template.json`](cupback.template.json).
4. **Create Invitation**, then **CupBack**, then **Pay cup deposit**. Fill the variables (see [`invitations/`](invitations/) for the exact values used), add inputs, sign and broadcast.
5. On the deposit output, start the **Refund at booth** follow-up. Join as **Return booth**, add one coin from the booth address as input 1, sign and broadcast.
6. Inspect each invitation in the tool's **Inspect** view.

The exported invitations and transaction IDs from our run are in [`invitations/`](invitations/).

## Verified: XO compiles the same contract as CashScript

With the deposit variables used in our test, the XO debug tool compiled the deposit locking bytecode to

```
aa202386372fc9563e4f98d8dba74c3a0bee36a7f99617d409b29831ee48f1796cfb87
```

Building the redeem script independently, the way CashScript does (push `receiptId`, `recoveryTime`, the three locking scripts, then the `CupDeposit` bytecode) and hashing it with HASH256 gives the identical P2SH32 locking bytecode. The XO template and the CupBack app produce the same on-chain contract.
