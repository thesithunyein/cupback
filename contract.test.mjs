import test from 'node:test';
import assert from 'node:assert/strict';
import { binToHex, createVirtualMachineBCH, decodeTransaction, hexToBin } from '@bitauth/libauth';
import { MockNetworkProvider, SignatureTemplate, TransactionBuilder } from 'cashscript';
import { depositContract } from './chain.js';

const provider = new MockNetworkProvider();
const vm = createVirtualMachineBCH();
const recovery = 1900000000;
import { encodeCashAddress, hash160, secp256k1 } from '@bitauth/libauth';
function person(value) {
  const key = new Uint8Array(32).fill(value);
  const publicKey = secp256k1.derivePublicKeyCompressed(key);
  const address = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: hash160(publicKey) }).address;
  const lockingBytecode = '76a914' + binToHex(hash160(publicKey)) + '88ac';
  return { address, lockingBytecode, unlock: new SignatureTemplate(key).unlockP2PKH() };
}
const buyer = person(1);
const booth = person(2);
const organizer = person(3);
const stranger = person(4);
const receipt = {
  buyer: buyer.address, nonce: '01'.repeat(16),
  event: { booth: booth.address, organizer: organizer.address, recovery },
};
const deposit = depositContract(receipt);
const principal = 10000n;
const feeCoin = 10000n;

function evaluate({ signer = booth, recipient = buyer, amount = principal, recover = false, locktime = 0 } = {}) {
  const depositUtxo = { txid: '11'.repeat(32), vout: 0, satoshis: principal, lockingBytecode: deposit.lockingBytecode };
  const signerUtxo = { txid: '22'.repeat(32), vout: 0, satoshis: feeCoin, lockingBytecode: signer.lockingBytecode };
  const path = recover ? 'recover' : 'refund';
  const built = new TransactionBuilder({ provider, maximumFeeSatoshis: 2000n })
    .addInput(depositUtxo, deposit.unlock[path](hexToBin(receipt.nonce)))
    .addInput(signerUtxo, signer.unlock)
    .addOutput({ to: recipient.address, amount })
    .addOutput({ to: signer.address, amount: 9000n })
    .setLocktime(locktime)
    .build();
  const transaction = decodeTransaction(hexToBin(built));
  return vm.verify({
    transaction,
    sourceOutputs: [depositUtxo, signerUtxo].map(utxo => ({
      lockingBytecode: hexToBin(utxo.lockingBytecode), valueSatoshis: utxo.satoshis,
    })),
  });
}

test('booth and organizer can approve a full refund', () => {
  assert.equal(evaluate(), true);
  assert.equal(evaluate({ signer: organizer }), true);
});
test('a refund cannot be redirected, reduced, or approved by a stranger', () => {
  assert.notEqual(evaluate({ recipient: stranger }), true);
  assert.notEqual(evaluate({ amount: principal - 1n }), true);
  assert.notEqual(evaluate({ signer: stranger }), true);
});
test('customer recovery requires the configured time and buyer authorization', () => {
  assert.equal(evaluate({ signer: buyer, recover: true, locktime: recovery }), true);
  assert.notEqual(evaluate({ signer: buyer, recover: true, locktime: recovery - 1 }), true);
  assert.notEqual(evaluate({ signer: stranger, recover: true, locktime: recovery }), true);
});

