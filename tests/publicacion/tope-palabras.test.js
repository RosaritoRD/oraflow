const test = require('node:test');
const assert = require('node:assert/strict');
const { topePalabras, recortaSecciones, cuentaPalabras } = require('../../utils/longitud');

// 29/09: with "14-16 minutes" the AI wrote ~3,000 words (≈20 min, 17,894 ElevenLabs
// characters). Long videos move to 6-8 min with a HARD word cap.

test('the cap comes from the maximum minutes at 130 words/min', () => {
  assert.equal(topePalabras('6-8 minutes'), 1040);
  assert.equal(topePalabras('10 minutes'), 1300);
});

test('without minutes (Shorts in seconds) there\'s no cap', () => {
  assert.equal(topePalabras('60-90 seconds (about 150-190 spoken words in total)'), null);
  assert.equal(topePalabras(''), null);
});

const seccion = (n) => ({ title: `S${n}`, content: [Array(300).fill('palabra').join(' ')] });

test('trims sections from the end until it fits the cap', () => {
  const out = recortaSecciones([seccion(1), seccion(2), seccion(3), seccion(4), seccion(5)], 1040, 60);
  assert.equal(out.length, 3); // 3×300 + 60 = 960 ≤ 1040
  assert.deepEqual(out.map(s => s.title), ['S1', 'S2', 'S3']);
});

test('never leaves the script without sections', () => {
  assert.equal(recortaSecciones([seccion(1)], 100, 0).length, 1);
});

test('without a cap it touches nothing', () => {
  const s = [seccion(1), seccion(2)];
  assert.equal(recortaSecciones(s, null, 0), s);
});

test('counts words in text and lists', () => {
  assert.equal(cuentaPalabras('Señor, dame paz.'), 3);
  assert.equal(cuentaPalabras(['uno dos', 'tres']), 3);
  assert.equal(cuentaPalabras(null), 0);
});
