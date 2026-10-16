// 03/10/2026: the owner asked for Bible references to be READ properly by the
// voice, even if the video runs a bit longer. «Salmo 5:3» went into the scripts as
// is and the voice read it like a time. Rule: the full book, «capítulo» + the
// number in words, «versículo» + the number in words. Psalms don't say «capítulo».
const test = require('node:test');
const assert = require('node:assert');
const { leeCitasBiblicas, numeroEnLetras } = require('../../utils/citas-biblicas');

test('the owner\'s examples, as is', () => {
  assert.strictEqual(leeCitasBiblicas('Jn 3,16'), 'Juan, capítulo tres, versículo dieciséis');
  assert.strictEqual(leeCitasBiblicas('Gn 1,1'), 'Génesis, capítulo uno, versículo uno');
  assert.strictEqual(leeCitasBiblicas('Sal 23,1'), 'Salmo veintitrés, versículo uno');
  assert.strictEqual(leeCitasBiblicas('Mt 5,3–10'), 'Mateo, capítulo cinco, versículos tres a diez');
});

test('the colon format of the real scripts', () => {
  assert.strictEqual(
    leeCitasBiblicas('Tu Palabra dice en el Salmo 5:3: «Oh Jehová, de mañana oirás mi voz».'),
    'Tu Palabra dice en el Salmo cinco, versículo tres: «Oh Jehová, de mañana oirás mi voz».');
  assert.strictEqual(leeCitasBiblicas('Tu Palabra dice en Salmo 56:3.'), 'Tu Palabra dice en Salmo cincuenta y seis, versículo tres.');
  assert.strictEqual(leeCitasBiblicas('Salmos 121:7-8'), 'Salmo ciento veintiuno, versículos siete a ocho');
});

test('full names and numbered books', () => {
  assert.strictEqual(leeCitasBiblicas('Filipenses 4:13'), 'Filipenses, capítulo cuatro, versículo trece');
  assert.strictEqual(leeCitasBiblicas('1 Corintios 13:4-7'), 'Primera de Corintios, capítulo trece, versículos cuatro a siete');
  assert.strictEqual(leeCitasBiblicas('2 Tim 1,7'), 'Segunda de Timoteo, capítulo uno, versículo siete');
  assert.strictEqual(leeCitasBiblicas('1 Jn 4,18'), 'Primera de Juan, capítulo cuatro, versículo dieciocho');
  assert.strictEqual(leeCitasBiblicas('Isaías 41:10'), 'Isaías, capítulo cuarenta y uno, versículo diez');
  assert.strictEqual(leeCitasBiblicas('Rom. 8:28'), 'Romanos, capítulo ocho, versículo veintiocho');
});

test('several separate verses', () => {
  assert.strictEqual(leeCitasBiblicas('Jn 3,16.18'), 'Juan, capítulo tres, versículos dieciséis y dieciocho');
  assert.strictEqual(leeCitasBiblicas('Juan 14:1,27'), 'Juan, capítulo catorce, versículos uno y veintisiete');
});

test('a Psalm without a verse is also said in words', () => {
  assert.strictEqual(leeCitasBiblicas('Lee el Salmo 23 antes de dormir.'), 'Lee el Salmo veintitrés antes de dormir.');
  assert.strictEqual(leeCitasBiblicas('Sal 91'), 'Salmo noventa y uno');
});

test('doesn\'t touch what isn\'t a reference', () => {
  const frases = [
    'Me levanto a las 5:30 cada mañana.',
    'Juan tiene 3 hijos y 2 trabajos.',
    'Señor, gracias por este nuevo día.',
    'Llevo 2,5 años esperando.',
    'Mi 6 de la mañana es tuyo.'
  ];
  for (const f of frases) assert.strictEqual(leeCitasBiblicas(f), f);
});

test('numbers in words, up to the last verse of Psalm 119', () => {
  const casos = { 1: 'uno', 15: 'quince', 16: 'dieciséis', 21: 'veintiuno', 22: 'veintidós', 30: 'treinta',
    31: 'treinta y uno', 100: 'cien', 101: 'ciento uno', 119: 'ciento diecinueve', 150: 'ciento cincuenta', 176: 'ciento setenta y seis' };
  for (const [n, letra] of Object.entries(casos)) assert.strictEqual(numeroEnLetras(Number(n)), letra);
});
