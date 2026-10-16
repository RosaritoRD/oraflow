// 02/10/2026: «more landscapes, and related to whether it's night or day».
const test = require('node:test');
const assert = require('node:assert/strict');
const { momentoDe, consultaPaisaje, ajustePaisaje } = require('../../utils/paisaje-franja');

test('the moment comes from the script (content\'s time of day) and otherwise from the slot\'s hour', () => {
  assert.equal(momentoDe({ script: { title: 'Oración de la noche para dormir en paz' } }), 'noche');
  assert.equal(momentoDe({ script: { title: 'Oración para empezar el día' }, strategy: { franja: 'MAÑANA' } }), 'manana');
  assert.equal(momentoDe({ script: {}, strategy: { franja: 'TARDE' } }), 'tarde');
  assert.equal(momentoDe({}), 'manana', 'sin datos: mañana, el formato principal');
});

test('each scene asks for a different landscape, from its time of day', () => {
  const noche = [0, 1, 2, 3].map(i => consultaPaisaje('noche', i));
  assert.equal(new Set(noche).size, 4);
  assert.ok(noche.every(q => /night|stars|starry|moon/.test(q)));
  assert.ok([0, 1, 2].map(i => consultaPaisaje('manana', i)).every(q => /sunrise|morning|dawn/.test(q)));
  assert.ok(/golden hour|sunset|afternoon/.test(consultaPaisaje('tarde', 0)));
});

const asset = (title, keywords = []) => ({ title, keywords });

test('landscapes go up; non-landscapes don\'t', () => {
  assert.ok(ajustePaisaje(asset('Mountain lake at sunrise'), 'manana') > 0);
  assert.equal(ajustePaisaje(asset('Woman reading a book'), 'manana'), 0);
});

test('what clashes with the time of day drops a lot', () => {
  assert.ok(ajustePaisaje(asset('Starry night sky over mountains'), 'manana') < -10);
  assert.ok(ajustePaisaje(asset('Sunrise over the sea', ['morning']), 'noche') < -10);
  assert.ok(ajustePaisaje(asset('Starry night sky over mountains'), 'noche') > 0);
});

test('also reads keywords (strings or {name} objects)', () => {
  assert.ok(ajustePaisaje(asset('clip 123', [{ name: 'forest' }, 'night']), 'noche') > 0);
});
