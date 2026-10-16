// 07/10/2026: in the long video «Antes de mirar el teléfono» ElevenLabs said
// «teléfene». The script was spelled right; it's the voice that stumbles. What gets
// NARRATED (and the captions, which come from the narration) uses a word the voice
// says well.
const test = require('node:test');
const assert = require('node:assert');
const { suavizaPalabras } = require('../../utils/palabras-dificiles');
const { buildNarrationPlan } = require('../../utils/voice-pacing');

test('teléfono is narrated as celular, with its number and capitalization', () => {
  assert.strictEqual(suavizaPalabras('Antes de mirar el teléfono, respira.'), 'Antes de mirar el celular, respira.');
  assert.strictEqual(suavizaPalabras('Teléfono en mano'), 'Celular en mano');
  assert.strictEqual(suavizaPalabras('los teléfonos y las pantallas'), 'los celulares y las pantallas');
  assert.strictEqual(suavizaPalabras('TELÉFONO'), 'CELULAR');
  assert.strictEqual(suavizaPalabras('telefono sin tilde'), 'celular sin tilde');
});

test('doesn\'t touch words that only look similar', () => {
  assert.strictEqual(suavizaPalabras('telefonista y telefonear'), 'telefonista y telefonear');
});

test('the Spanish narration plan already comes out softened', () => {
  const plan = buildNarrationPlan({ hook: { text: 'Señor, antes de tocar el teléfono, hago una pausa.' } }, { language: 'es' });
  assert.match(plan.map(p => p.text).join(' '), /antes de tocar el celular, hago una pausa/);
});

test('in English nothing changes', () => {
  const plan = buildNarrationPlan({ hook: { text: 'Put the teléfono down.' } }, { language: 'en' });
  assert.match(plan.map(p => p.text).join(' '), /teléfono/);
});
