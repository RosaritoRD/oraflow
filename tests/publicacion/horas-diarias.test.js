const test = require('node:test');
const assert = require('node:assert/strict');
const { validaHoras } = require('../../utils/daily-slot');

test('valid times: normalized and sorted', () => {
  assert.equal(validaHoras('19:00, 5:00,12:00'), '05:00,12:00,19:00');
  assert.equal(validaHoras('04:00'), '04:00');
});

test('"off" apaga ese formato', () => {
  assert.equal(validaHoras('OFF'), 'off');
});

test('garbage or too many times are rejected', () => {
  for (const malo of ['', '25:00', '4pm', '04:00,abc', '1:00,2:00,3:00,4:00,5:00,6:00,7:00']) {
    assert.throws(() => validaHoras(malo), /times?|hora|horas/i, malo);
  }
});

test('repeated times count once', () => {
  assert.equal(validaHoras('05:00,5:00'), '05:00');
});
