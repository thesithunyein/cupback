import {
  binToHex, cashAddressToLockingBytecode, decodeTransaction, encodeCashAddress,
  encodeTransaction, hash160, hashTransaction, hexToBin, sha256,
} from '@bitauth/libauth';
import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { initiateDappRelay } from '@wizardconnect/core';
import { sourceOutputToRelay } from '@wizardconnect/core/hdwalletv1-serialize';
import { DappConnectionManager } from '@wizardconnect/dapp';
import artifact from './contract.json' with { type: 'json' };

export const network = import.meta.env?.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';
const prefix = network === 'mainnet' ? 'bitcoincash' : 'bchtest';
export const provider = new ElectrumNetworkProvider(network);
const fee = 900n;
let manager;
let relay;

export function addressScript(address) {
  if (typeof address !== 'string' || !address.startsWith(prefix + ':')) {
    throw Error('Use a ' + network + ' address with its prefix.');
  }
  const result = cashAddressToLockingBytecode(address);
  if (typeof result === 'string' || !/^76a914[0-9a-f]{40}88ac$/.test(binToHex(result.bytecode))) {
    throw Error('Enter a standard BCH wallet address.');
  }
  return result.bytecode;
}

export function startWallet(onReady) {
  if (manager?.isWalletDiscovered()) {
    onReady();
    return null;
  }
  relay?.cleanup();
  manager = new DappConnectionManager('CupBack', undefined, { session: false });
  manager.on('walletready', onReady);
  relay = initiateDappRelay(({client, status}) => manager.updateConnection(client, status));
  return relay.uri;
}

export async function stopWallet() {
  try { await manager?.sendDisconnect('Wallet disconnected'); }
  finally { relay?.cleanup(); relay = undefined; manager = undefined; }
}

export function walletAddress(branch = 0, index = 0) {
  const publicKey = manager?.getPubkey(branch, BigInt(index));
  if (!publicKey) throw Error('Connect a compatible BCH wallet first.');
  const result = encodeCashAddress({ prefix, type: 'p2pkh', payload: hash160(publicKey) });
  if (typeof result === 'string') throw Error(result);
  return result.address;
}

export function depositContract(receipt) {
  const { event, buyer, nonce } = receipt;
  return new Contract(artifact, [
    addressScript(buyer), addressScript(event.booth), addressScript(event.organizer),
    BigInt(event.recovery), hexToBin(nonce),
  ], { provider, contractType: 'p2sh32' });
}

const output = (lockingBytecode, valueSatoshis) => ({ lockingBytecode, valueSatoshis });
const input = (utxo, unlockingBytecode = new Uint8Array()) => ({
  outpointTransactionHash: hexToBin(utxo.txid), outpointIndex: utxo.vout,
  sequenceNumber: 0xfffffffe, unlockingBytecode,
});

async function funding(amount, permitted) {
  const paths = permitted
    ? [{ branch: 0, index: 0, address: walletAddress() }]
    : [0, 1].flatMap(branch => Array.from({length: 8}, (_, index) => ({
      branch, index, address: walletAddress(branch, index),
    })));
  const allowed = paths.filter(path => !permitted || permitted.includes(path.address));
  if (!allowed.length) throw Error('Connect the wallet named on this receipt.');
  const utxos = (await Promise.all(allowed.map(async path =>
    (await provider.getUtxos(path.address)).map(utxo => ({ ...utxo, ...path }))
  ))).flat().filter(utxo => !utxo.token && utxo.satoshis >= amount + fee)
    .sort((a, b) => a.satoshis < b.satoshis ? -1 : a.satoshis > b.satoshis ? 1 : 0);
  if (!utxos.length) throw Error('The wallet needs one BCH balance entry large enough for the amount and fee.');
  return utxos[0];
}

function withChange(outputs, coin, spent) {
  const change = coin.satoshis - spent - fee;
  if (change >= 546n) outputs.push(output(addressScript(coin.address), change));
  return outputs;
}

export function serializeWalletInputs(transaction, sourceOutputs) {
  return sourceOutputs.map((output, index) =>
    sourceOutputToRelay({ ...transaction.inputs[index], ...output })
  );
}

async function signAndSend(transaction, sourceOutputs, coin, index, prompt, beforeBroadcast) {
  const response = await manager.signTransaction({
    transaction: {
      transaction: binToHex(encodeTransaction(transaction)),
      sourceOutputs: serializeWalletInputs(transaction, sourceOutputs),
      broadcast: false, userPrompt: prompt,
    },
    inputPaths: [[index, coin.branch === 0 ? 'receive' : 'change', coin.index]],
  }, { signal: AbortSignal.timeout(120000) });
  const signedBytes = hexToBin(response.signedTransaction);
  const signed = decodeTransaction(signedBytes);
  if (typeof signed === 'string' || !signed.inputs[index]?.unlockingBytecode.length) {
    throw Error('The wallet did not approve. Nothing was sent.');
  }
  const comparable = { ...signed, inputs: signed.inputs.map((item, position) =>
    position === index ? { ...item, unlockingBytecode: new Uint8Array() } : item
  ) };
  if (binToHex(encodeTransaction(comparable)) !== binToHex(encodeTransaction(transaction))) {
    throw Error('The wallet changed the transaction. Nothing was sent.');
  }
  const txid = hashTransaction(signedBytes);
  beforeBroadcast(txid);
  await broadcastSigned(provider, response.signedTransaction, txid);
  return txid;
}

export async function broadcastSigned(node, signedTransaction, txid) {
  try {
    await node.sendRawTransaction(signedTransaction);
  } catch {
    // A node can accept a transaction even if its reply never reaches the app.
    const raw = await node.getRawTransaction(txid).catch(() => null);
    if (typeof raw === 'string' && /^[a-f0-9]+$/i.test(raw) && hashTransaction(hexToBin(raw)) === txid) return;
    throw Error('We could not check if it went through. Open Find receipt before trying again.');
  }
}

// When the guest wallet is also an approver (solo demo), set aside a coin on the
// approver address so the same wallet can pay the refund fee right away.
export const soloReserve = 2000n;

export function isApprover(event, address) {
  return address === event.booth || address === event.organizer;
}

export async function pay(event, persist) {
  const buyer = walletAddress();
  const receipt = { event, buyer, nonce: binToHex(crypto.getRandomValues(new Uint8Array(16))) };
  const contract = depositContract(receipt);
  const amount = BigInt(event.amount);
  const reserve = isApprover(event, buyer) ? soloReserve : 0n;
  const coin = await funding(amount + reserve);
  const outputs = [output(hexToBin(contract.lockingBytecode), amount)];
  if (reserve) outputs.push(output(addressScript(buyer), reserve));
  const transaction = {
    version: 2, locktime: 0, inputs: [input(coin)],
    outputs: withChange(outputs, coin, amount + reserve),
  };
  await signAndSend(transaction, [output(addressScript(coin.address), coin.satoshis)], coin, 0,
    'Pay your cup deposit', txid => {
      receipt.txid = txid;
      persist(receipt);
    });
  return receipt;
}

export async function lookup(receipt) {
  const contract = depositContract(receipt);
  const raw = await provider.getRawTransaction(receipt.txid);
  const tx = decodeTransaction(hexToBin(raw));
  if (typeof tx === 'string' || !tx.outputs[0] || tx.outputs[0].token ||
      binToHex(tx.outputs[0].lockingBytecode) !== contract.lockingBytecode ||
      tx.outputs[0].valueSatoshis !== BigInt(receipt.event.amount)) {
    throw Error('This receipt does not match a deposit on the network.');
  }
  return (await contract.getUtxos()).find(utxo => utxo.txid === receipt.txid && utxo.vout === 0) ?? null;
}

export async function findRefund(receipt) {
  const scriptHash = binToHex(sha256.hash(hexToBin(depositContract(receipt).lockingBytecode)).reverse());
  const history = await provider.performRequest('blockchain.scripthash.get_history', scriptHash);
  if (!Array.isArray(history)) throw Error('Could not fetch the refund history.');
  for (const entry of history) {
    if (entry.tx_hash === receipt.txid || !/^[a-f0-9]{64}$/.test(entry.tx_hash)) continue;
    const spending = decodeTransaction(hexToBin(await provider.getRawTransaction(entry.tx_hash)));
    if (typeof spending === 'string') continue;
    const firstInput = spending.inputs[0];
    if (firstInput?.outpointIndex === 0 && binToHex(firstInput.outpointTransactionHash) === receipt.txid) {
      return entry.tx_hash;
    }
  }
  return null;
}

// Timestamp locktimes are checked against the median time of the last 11 blocks,
// which runs roughly an hour behind the wall clock.
export async function medianTimePast() {
  const height = await provider.getBlockHeight();
  const result = await provider.performRequest('blockchain.block.headers', height - 10, 11);
  const bytes = hexToBin(result?.hex ?? '');
  if (bytes.length < 80 * 11) throw Error('Could not read the network time. Try again.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const times = Array.from({ length: 11 }, (_, i) => view.getUint32(i * 80 + 68, true)).sort((a, b) => a - b);
  return times[5];
}

export async function refund(receipt, recover, persist) {
  const { event, buyer } = receipt;
  if (recover) {
    const networkTime = await medianTimePast();
    if (networkTime <= event.recovery) {
      const minutes = Math.max(1, Math.ceil((event.recovery - networkTime) / 60));
      throw Error('The network clock has not reached the recovery time yet. Try again in about ' + minutes + ' minutes.');
    }
  }
  const deposit = await lookup(receipt);
  if (!deposit) throw Error('This deposit has already been spent. Refresh the receipt.');
  const contract = depositContract(receipt);
  const coin = await funding(0n, recover ? [buyer] : [event.booth, event.organizer]);
  const transaction = {
    version: 2, locktime: recover ? event.recovery : 0,
    inputs: [input(deposit), input(coin)],
    outputs: withChange([output(addressScript(buyer), deposit.satoshis)], coin, 0n),
  };
  const sourceOutputs = [
    output(hexToBin(contract.lockingBytecode), deposit.satoshis),
    output(addressScript(coin.address), coin.satoshis),
  ];
  const unlocker = contract.unlock[recover ? 'recover' : 'refund'](hexToBin(receipt.nonce));
  transaction.inputs[0].unlockingBytecode = unlocker.generateUnlockingBytecode({
    transaction, sourceOutputs, inputIndex: 0,
  });
  return signAndSend(transaction, sourceOutputs, coin, 1, recover ? 'Recover your deposit' : 'Approve cup refund', persist);
}
