const test = require('node:test');
const assert = require('node:assert/strict');
const { componeDescripcion } = require('../../agents/seo-optimizer-agent');
const { normalizeYouTubeMetadata } = require('../../utils/youtube-metadata-validator');

// 30/09: on YouTube the description came out as a single block ("Hoy!En este
// canal…"): the cleanup was deleting line breaks as if they were junk.
// The owner's requested format: each sentence in its own paragraph, separated by a
// blank line.

test('the YouTube cleanup keeps the description\'s line breaks', () => {
  const out = normalizeYouTubeMetadata({ title: 'T', description: 'Uno.\r\n\r\n\r\nDos.\n\nTres.\u0007' });
  assert.equal(out.description, 'Uno.\n\nDos.\n\nTres.');
});

test('the title still has no line breaks', () => {
  assert.equal(normalizeYouTubeMetadata({ title: 'Oración\nde la noche', description: '' }).title, 'Oración de la noche');
});

test('each sentence of the welcome and the body goes in its own paragraph', () => {
  process.env.DESCRIPTION_INTRO = '¡Bienvenido a Oración de Hoy!\\nEn este canal hay fe. Nuestro objetivo es ayudarte.';
  delete process.env.DESCRIPTION_FOOTER;
  const d = componeDescripcion(
    'Esta oración te ayudará hoy. Inspírate en Salmo 5:3 y escucha hasta el final.\nSi te llegó, escribe “Amén”.',
    ['oraciondelamañana', 'salmo53']
  );
  assert.deepEqual(d.split('\n\n'), [
    '¡Bienvenido a Oración de Hoy!',
    'En este canal hay fe.',
    'Nuestro objetivo es ayudarte.',
    'Esta oración te ayudará hoy.',
    'Inspírate en Salmo 5:3 y escucha hasta el final.',
    'Si te llegó, escribe “Amén”.',
    '#oraciondelamañana #salmo53'
  ]);
  delete process.env.DESCRIPTION_INTRO;
});

test('doesn\'t split verses or times', () => {
  const d = componeDescripcion('Lee Salmo 121:7-8 esta noche. Son las 4:00 a. m. en punto.', []);
  assert.deepEqual(d.split('\n\n'), ['Lee Salmo 121:7-8 esta noche.', 'Son las 4:00 a. m. en punto.']);
});
