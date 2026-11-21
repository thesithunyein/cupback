export function depositSatoshis(value) {
  const match = /^(\d{1,2})(?:\.(\d{1,8}))?$/.exec(value.trim());
  if (!match) throw Error('Enter a BCH amount, like 0.001.');
  const amount = BigInt(match[1]) * 100000000n + BigInt((match[2] ?? '').padEnd(8, '0'));
  if (amount < 1000n || amount > 999999999n) {
    throw Error('Enter between 0.00001 and 9.99999999 BCH.');
  }
  return amount.toString();
}
