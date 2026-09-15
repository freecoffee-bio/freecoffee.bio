import assert from 'node:assert/strict';
import test from 'node:test';
import { amountToMinor, calculateTax, convertMinor, minorToAmount } from '../src/server/money';

test('rounds converted JPY half up to a whole minor unit', () => {
  assert.equal(convertMinor(1, 'USD', 'JPY', '150'), 2);
});

test('uses half up rounding for monetary amounts', () => {
  assert.equal(amountToMinor('1.005', 'USD'), 101);
  assert.equal(amountToMinor('1.5', 'JPY'), 2);
});

test('keeps JPY display amounts integer', () => {
  assert.equal(minorToAmount(12, 'JPY'), '12');
});

test('calculates tax and total in minor units', () => {
  const subtotal = amountToMinor('10.00', 'USD');
  const tax = calculateTax(subtotal, 825, 'USD');
  assert.equal(tax, 83);
  assert.equal(subtotal + tax, 1083);
});

test('converts non-USD currencies through USD rates', () => {
  const usd = convertMinor(920, 'EUR', 'USD', '1.08695652173913043478');
  assert.equal(usd, 1000);
});

test('rounds tax and converted amounts only at currency precision', () => {
  assert.equal(calculateTax(1, 5000, 'JPY'), 1);
  assert.equal(convertMinor(1, 'USD', 'JPY', '150'), 2);
  assert.equal(convertMinor(100, 'JPY', 'USD', '0.0066666666666666667'), 67);
});
