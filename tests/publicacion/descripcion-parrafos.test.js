const test = require('node:test');
const assert = require('node:assert/strict');
const { componeDescripcion } = require('../../agents/seo-optimizer-agent');
const { normalizeYouTubeMetadata } = require('../../utils/youtube-metadata-validator');

// 30/09: en YouTube la descripción salía en un solo bloque ("Hoy!En este
// canal…"): la limpieza borraba los saltos de línea como si fueran basura.
// Formato pedido por el autor: cada frase en su párrafo, separados por una línea.

test('la limpieza para YouTube conserva los saltos de línea de la descripción', () => {
  const out = normalizeYouTubeMetadata({ title: 'T', description: 'Uno.\r\n\r\n\r\nDos.\n\nTres.\u0007' });
  assert.equal(out.description, 'Uno.\n\nDos.\n\nTres.');
});

test('el título sigue sin saltos de línea', () => {
  assert.equal(normalizeYouTubeMetadata({ title: 'Oración\nde la noche', description: '' }).title, 'Oración de la noche');
});

test('cada frase de la bienvenida y del cuerpo va en su propio párrafo', () => {
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

test('no parte versículos ni horas', () => {
  const d = componeDescripcion('Lee Salmo 121:7-8 esta noche. Son las 4:00 a. m. en punto.', []);
  assert.deepEqual(d.split('\n\n'), ['Lee Salmo 121:7-8 esta noche.', 'Son las 4:00 a. m. en punto.']);
});
