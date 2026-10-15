const test = require('node:test');
const assert = require('node:assert/strict');
const { validaHoras } = require('../../utils/daily-slot');

test('horas válidas: se normalizan y ordenan', () => {
  assert.equal(validaHoras('19:00, 5:00,12:00'), '05:00,12:00,19:00');
  assert.equal(validaHoras('04:00'), '04:00');
});

test('"off" apaga ese formato', () => {
  assert.equal(validaHoras('OFF'), 'off');
});

test('basura o demasiadas horas se rechazan', () => {
  for (const malo of ['', '25:00', '4pm', '04:00,abc', '1:00,2:00,3:00,4:00,5:00,6:00,7:00']) {
    assert.throws(() => validaHoras(malo), /hora|horas/i, malo);
  }
});

test('horas repetidas cuentan una vez', () => {
  assert.equal(validaHoras('05:00,5:00'), '05:00');
});
