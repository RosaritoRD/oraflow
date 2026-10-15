const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, rank, highlight } = require('../../dashboard/search-core');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const items = [
  { group: 'Navigate', label: 'Shorts', hint: 'Verses in, shorts out.', keywords: 'versiculos biblia salmos' },
  { group: 'Navigate', label: 'Channel setup', hint: 'Make every agent sound like you.', keywords: 'configuracion canal cuentas' },
  { group: 'Videos', label: 'Oración de la mañana — Salmo 46', hint: 'Needs review', keywords: '' },
  { group: 'Actions', label: 'Create video', hint: 'Queue a new generation job', keywords: 'crear nuevo video generar' }
];

test('normalize quita tildes y mayúsculas', () => {
  assert.equal(normalize('Oración  de la MAÑANA'), 'oracion  de la manana');
});

test('sin búsqueda devuelve todo en su orden', () => {
  assert.deepEqual(rank(items, '').map(i => i.label), items.map(i => i.label));
});

test('encuentra sin tildes y por palabra clave en español', () => {
  assert.deepEqual(rank(items, 'oracion').map(i => i.label), ['Oración de la mañana — Salmo 46']);
  assert.deepEqual(rank(items, 'configuración').map(i => i.label), ['Channel setup']);
  assert.deepEqual(rank(items, 'versiculos').map(i => i.label), ['Shorts']);
});

test('todas las palabras deben aparecer, en cualquier orden', () => {
  assert.deepEqual(rank(items, 'salmo manana').map(i => i.label), ['Oración de la mañana — Salmo 46']);
  assert.deepEqual(rank(items, 'salmo zzz'), []);
});

test('lo que empieza por la búsqueda va primero', () => {
  const r = rank([
    { label: 'Analytics', hint: 'see shorts performance', keywords: '' },
    { label: 'Shorts', hint: '', keywords: '' }
  ], 'shorts');
  assert.equal(r[0].label, 'Shorts');
});

test('el tope por grupo recorta los resultados de contenido', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ group: 'Videos', label: `Video ${i}`, hint: '', keywords: '' }));
  assert.equal(rank(muchos, 'video', { limitPerGroup: { Videos: 6 } }).length, 6);
});

test('highlight escapa el texto y marca lo encontrado, aunque tenga tildes', () => {
  assert.equal(highlight('Oración <b>', 'oracion', esc), '<mark>Oración</mark> &lt;b&gt;');
  assert.equal(highlight('Salmo 46', 'salmo 46', esc), '<mark>Salmo</mark> <mark>46</mark>');
  assert.equal(highlight('<img onerror=x>', '', esc), '&lt;img onerror=x&gt;');
});

test('highlight sigue marcando aunque el título lleve emojis con selector de variante', () => {
  assert.equal(highlight('Oración ❤️ de paz', 'oracion paz', esc), '<mark>Oración</mark> ❤️ de <mark>paz</mark>');
});

test('highlight con emojis de dos unidades (🙏) antes de la coincidencia', () => {
  assert.equal(highlight('🙏🙏 Salmo de paz', 'paz', esc), '🙏🙏 Salmo de <mark>paz</mark>');
});
