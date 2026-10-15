// 02/10/2026 (el autor): «que sean más paisajes y relacionados si es de noche o de día».
const test = require('node:test');
const assert = require('node:assert/strict');
const { momentoDe, consultaPaisaje, ajustePaisaje } = require('../../utils/paisaje-franja');

test('el momento sale del guion (franja del contenido) y si no, de la hora del hueco', () => {
  assert.equal(momentoDe({ script: { title: 'Oración de la noche para dormir en paz' } }), 'noche');
  assert.equal(momentoDe({ script: { title: 'Oración para empezar el día' }, strategy: { franja: 'MAÑANA' } }), 'manana');
  assert.equal(momentoDe({ script: {}, strategy: { franja: 'TARDE' } }), 'tarde');
  assert.equal(momentoDe({}), 'manana', 'sin datos: mañana, el formato principal');
});

test('cada escena pide un paisaje distinto, de su franja', () => {
  const noche = [0, 1, 2, 3].map(i => consultaPaisaje('noche', i));
  assert.equal(new Set(noche).size, 4);
  assert.ok(noche.every(q => /night|stars|starry|moon/.test(q)));
  assert.ok([0, 1, 2].map(i => consultaPaisaje('manana', i)).every(q => /sunrise|morning|dawn/.test(q)));
  assert.ok(/golden hour|sunset|afternoon/.test(consultaPaisaje('tarde', 0)));
});

const asset = (title, keywords = []) => ({ title, keywords });

test('los paisajes suben; lo que no es paisaje no', () => {
  assert.ok(ajustePaisaje(asset('Mountain lake at sunrise'), 'manana') > 0);
  assert.equal(ajustePaisaje(asset('Woman reading a book'), 'manana'), 0);
});

test('lo que choca con la hora del día baja mucho', () => {
  assert.ok(ajustePaisaje(asset('Starry night sky over mountains'), 'manana') < -10);
  assert.ok(ajustePaisaje(asset('Sunrise over the sea', ['morning']), 'noche') < -10);
  assert.ok(ajustePaisaje(asset('Starry night sky over mountains'), 'noche') > 0);
});

test('lee también las palabras clave (strings u objetos {name})', () => {
  assert.ok(ajustePaisaje(asset('clip 123', [{ name: 'forest' }, 'night']), 'noche') > 0);
});
