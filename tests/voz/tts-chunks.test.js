const test = require('node:test');
const assert = require('node:assert/strict');
const { splitForTts, mergeAlignments } = require('../../utils/tts-chunks');

test('a short text goes in a single request', () => {
  assert.deepEqual(splitForTts('Señor, gracias por este día.'), ['Señor, gracias por este día.']);
});

test('a 12,000-character script is split into chunks ≤ max without losing text', () => {
  const parrafo = 'Señor, hoy pongo en tus manos cada paso que voy a dar. <break time="0.6s" /> Tú conoces mi camino. '.repeat(12);
  const texto = Array.from({ length: 10 }, () => parrafo.trim()).join('\n\n');
  assert.ok(texto.length > 10000);
  const trozos = splitForTts(texto, 4500);
  assert.ok(trozos.length >= 3);
  for (const t of trozos) assert.ok(t.length <= 4500, `trozo de ${t.length}`);
  const sinEspacios = s => s.replace(/\s+/g, '');
  assert.equal(sinEspacios(trozos.join(' ')), sinEspacios(texto));
});

test('a giant paragraph is cut at sentences and not mid-word', () => {
  const texto = 'Dios está contigo en cada paso del camino. '.repeat(300);
  const trozos = splitForTts(texto, 1000);
  for (const t of trozos) {
    assert.ok(t.length <= 1000);
    assert.match(t, /\.$/);
  }
});

test('mergeAlignments shifts times by each audio\'s real duration', () => {
  const a = { characters: ['H', 'o'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  const b = { characters: ['l', 'a'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] };
  const m = mergeAlignments([{ alignment: a, duration: 1.5 }, { alignment: b, duration: 1 }]);
  assert.deepEqual(m.characters, ['H', 'o', ' ', 'l', 'a']);
  assert.deepEqual(m.character_start_times_seconds, [0, 0.1, 1.5, 1.5, 1.6]);
  assert.equal(m.character_end_times_seconds.at(-1), 1.7);
});

test('without alignment in some chunk it returns null (continues without per-word captions)', () => {
  assert.equal(mergeAlignments([{ alignment: null, duration: 1 }]), null);
});
