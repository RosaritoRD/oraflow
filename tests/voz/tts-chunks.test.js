const test = require('node:test');
const assert = require('node:assert/strict');
const { splitForTts, mergeAlignments } = require('../../utils/tts-chunks');

test('un texto corto va en una sola petición', () => {
  assert.deepEqual(splitForTts('Señor, gracias por este día.'), ['Señor, gracias por este día.']);
});

test('un guion de 12.000 caracteres se parte en trozos ≤ máximo sin perder texto', () => {
  const parrafo = 'Señor, hoy pongo en tus manos cada paso que voy a dar. <break time="0.6s" /> Tú conoces mi camino. '.repeat(12);
  const texto = Array.from({ length: 10 }, () => parrafo.trim()).join('\n\n');
  assert.ok(texto.length > 10000);
  const trozos = splitForTts(texto, 4500);
  assert.ok(trozos.length >= 3);
  for (const t of trozos) assert.ok(t.length <= 4500, `trozo de ${t.length}`);
  const sinEspacios = s => s.replace(/\s+/g, '');
  assert.equal(sinEspacios(trozos.join(' ')), sinEspacios(texto));
});

test('un párrafo gigante se corta por frases y no a mitad de palabra', () => {
  const texto = 'Dios está contigo en cada paso del camino. '.repeat(300);
  const trozos = splitForTts(texto, 1000);
  for (const t of trozos) {
    assert.ok(t.length <= 1000);
    assert.match(t, /\.$/);
  }
});

test('mergeAlignments desplaza los tiempos por la duración real de cada audio', () => {
  const a = { characters: ['H', 'o'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  const b = { characters: ['l', 'a'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  const m = mergeAlignments([{ alignment: a, duration: 1.5 }, { alignment: b, duration: 1 }]);
  assert.deepEqual(m.characters, ['H', 'o', ' ', 'l', 'a']);
  assert.deepEqual(m.character_start_times_seconds, [0, 0.1, 1.5, 1.5, 1.6]);
  assert.equal(m.character_end_times_seconds.at(-1), 1.7);
});

test('sin alineación en algún trozo devuelve null (se sigue sin captions por palabra)', () => {
  assert.equal(mergeAlignments([{ alignment: null, duration: 1 }]), null);
});
