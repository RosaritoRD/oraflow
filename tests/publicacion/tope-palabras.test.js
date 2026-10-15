const test = require('node:test');
const assert = require('node:assert/strict');
const { topePalabras, recortaSecciones, cuentaPalabras } = require('../../utils/longitud');

// 29/09: con "14-16 minutes" la IA escribió ~3.000 palabras (≈20 min, 17.894
// caracteres de ElevenLabs). El largo pasa a 6-8 min con tope DURO de palabras.

test('el tope sale del máximo de minutos a 130 palabras/min', () => {
  assert.equal(topePalabras('6-8 minutes'), 1040);
  assert.equal(topePalabras('10 minutes'), 1300);
});

test('sin minutos (Shorts en segundos) no hay tope', () => {
  assert.equal(topePalabras('60-90 seconds (about 150-190 spoken words in total)'), null);
  assert.equal(topePalabras(''), null);
});

const seccion = (n) => ({ title: `S${n}`, content: [Array(300).fill('palabra').join(' ')] });

test('recorta secciones del final hasta caber en el tope', () => {
  const out = recortaSecciones([seccion(1), seccion(2), seccion(3), seccion(4), seccion(5)], 1040, 60);
  assert.equal(out.length, 3); // 3×300 + 60 = 960 ≤ 1040
  assert.deepEqual(out.map(s => s.title), ['S1', 'S2', 'S3']);
});

test('nunca deja el guion sin secciones', () => {
  assert.equal(recortaSecciones([seccion(1)], 100, 0).length, 1);
});

test('sin tope no toca nada', () => {
  const s = [seccion(1), seccion(2)];
  assert.equal(recortaSecciones(s, null, 0), s);
});

test('cuenta palabras de texto y listas', () => {
  assert.equal(cuentaPalabras('Señor, dame paz.'), 3);
  assert.equal(cuentaPalabras(['uno dos', 'tres']), 3);
  assert.equal(cuentaPalabras(null), 0);
});
