import test from 'node:test';
import assert from 'node:assert/strict';
import { depositSatoshis } from './amounts.js';

test('converts BCH deposits to exact satoshis', () => {
  assert.equal(depositSatoshis('0.001'), '100000');
  assert.equal(depositSatoshis('0.00001'), '1000');
  assert.equal(depositSatoshis('9.99999999'), '999999999');
  for (const invalid of ['0', '10', '-1', '1e-4', '0.000010001', '0.00000999']) {
    assert.throws(() => depositSatoshis(invalid));
  }
});
