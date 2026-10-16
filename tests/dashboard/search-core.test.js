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

test('normalize strips accents and capitals', () => {
  assert.equal(normalize('Oración  de la MAÑANA'), 'oracion  de la manana');
});

test('without a search returns everything in its order', () => {
  assert.deepEqual(rank(items, '').map(i => i.label), items.map(i => i.label));
});

test('finds without accents and by a Spanish keyword', () => {
  assert.deepEqual(rank(items, 'oracion').map(i => i.label), ['Oración de la mañana — Salmo 46']);
  assert.deepEqual(rank(items, 'configuración').map(i => i.label), ['Channel setup']);
  assert.deepEqual(rank(items, 'versiculos').map(i => i.label), ['Shorts']);
});

test('every word must appear, in any order', () => {
  assert.deepEqual(rank(items, 'salmo manana').map(i => i.label), ['Oración de la mañana — Salmo 46']);
  assert.deepEqual(rank(items, 'salmo zzz'), []);
});

test('what starts with the search goes first', () => {
  const r = rank([
    { label: 'Analytics', hint: 'see shorts performance', keywords: '' },
    { label: 'Shorts', hint: '', keywords: '' }
  ], 'shorts');
  assert.equal(r[0].label, 'Shorts');
});

test('the per-group cap trims the content results', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ group: 'Videos', label: `Video ${i}`, hint: '', keywords: '' }));
  assert.equal(rank(muchos, 'video', { limitPerGroup: { Videos: 6 } }).length, 6);
});

test('highlight escapes the text and marks the match, even with accents', () => {
  assert.equal(highlight('Oración <b>', 'oracion', esc), '<mark>Oración</mark> &lt;b&gt;');
  assert.equal(highlight('Salmo 46', 'salmo 46', esc), '<mark>Salmo</mark> <mark>46</mark>');
  assert.equal(highlight('<img onerror=x>', '', esc), '&lt;img onerror=x&gt;');
});

test('highlight still marks even if the title has emojis with a variation selector', () => {
  assert.equal(highlight('Oración ❤️ de paz', 'oracion paz', esc), '<mark>Oración</mark> ❤️ de <mark>paz</mark>');
});

test('highlight with two-unit emojis (🙏) before the match', () => {
  assert.equal(highlight('🙏🙏 Salmo de paz', 'paz', esc), '🙏🙏 Salmo de <mark>paz</mark>');
});
