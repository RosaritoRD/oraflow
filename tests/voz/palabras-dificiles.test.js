// 07/10/2026: en el largo «Antes de mirar el teléfono» ElevenLabs dijo
// «teléfene». El guion estaba bien escrito; es la voz la que tropieza. Lo que se
// NARRA (y los subtítulos, que salen de lo narrado) usa una palabra que la voz
// dice bien.
const test = require('node:test');
const assert = require('node:assert');
const { suavizaPalabras } = require('../../utils/palabras-dificiles');
const { buildNarrationPlan } = require('../../utils/voice-pacing');

test('teléfono se narra como celular, con su número y su mayúscula', () => {
  assert.strictEqual(suavizaPalabras('Antes de mirar el teléfono, respira.'), 'Antes de mirar el celular, respira.');
  assert.strictEqual(suavizaPalabras('Teléfono en mano'), 'Celular en mano');
  assert.strictEqual(suavizaPalabras('los teléfonos y las pantallas'), 'los celulares y las pantallas');
  assert.strictEqual(suavizaPalabras('TELÉFONO'), 'CELULAR');
  assert.strictEqual(suavizaPalabras('telefono sin tilde'), 'celular sin tilde');
});

test('no toca palabras que solo se le parecen', () => {
  assert.strictEqual(suavizaPalabras('telefonista y telefonear'), 'telefonista y telefonear');
});

test('el plan de narración en español ya sale suavizado', () => {
  const plan = buildNarrationPlan({ hook: { text: 'Señor, antes de tocar el teléfono, hago una pausa.' } }, { language: 'es' });
  assert.match(plan.map(p => p.text).join(' '), /antes de tocar el celular, hago una pausa/);
});

test('en inglés no se cambia nada', () => {
  const plan = buildNarrationPlan({ hook: { text: 'Put the teléfono down.' } }, { language: 'en' });
  assert.match(plan.map(p => p.text).join(' '), /teléfono/);
});
