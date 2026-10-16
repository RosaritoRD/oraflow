// 03/10/2026: the owner asked for titles like the niche's big channels (@AbrazoDivino 219K, Sol
// Naciente 33K):
// //   «ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27»
// A fixed header with the time of day, the passage's PROMISE and what the listener receives in
// capitals, and the reference at the end in lower case. Still no date.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tituloEstiloOracion, usaEstiloOracion } = require('../../utils/titulo-oracion');

test('builds the full format from the AI\'s phrase', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'El Señor es mi luz y mi salvación: no temas lo que traiga este día ☀️🙏', franja: 'MAÑANA', referencia: 'Salmo 27' }),
    'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27');
});

test('a title already in the format doesn\'t change', () => {
  const t = 'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27';
  assert.equal(tituloEstiloOracion({ titulo: t, franja: 'MAÑANA', referencia: 'Salmo 27' }), t);
});

test('if the reference pushes it past 100, it goes without it (as Sol Naciente did with Salmo 32:8)', () => {
  const t = tituloEstiloOracion({ titulo: 'Dios abrirá el camino: confía en Él aunque no sepas qué hacer hoy', franja: 'MAÑANA', referencia: 'Salmo 32:8' });
  assert.equal(t, 'ORACIÓN DE LA MAÑANA | DIOS ABRIRÁ EL CAMINO: CONFÍA EN ÉL AUNQUE NO SEPAS QUÉ HACER HOY');
});

test('the content sets the time of day and the reference comes from the script', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'Oración de la mañana | En paz me acostaré: descansa en Dios esta noche | Salmos 4:8', franja: 'NOCHE', referencia: 'Salmos 4:8' }),
    'ORACIÓN DE LA NOCHE | EN PAZ ME ACOSTARÉ: DESCANSA EN DIOS ESTA NOCHE | Salmo 4:8');
});

test('never a date or a weekday', () => {
  const t = tituloEstiloOracion({ titulo: 'ORACIÓN DE LA MAÑANA — JUEVES 1 DE OCTUBRE | Dios es mi refugio: recibe su protección', franja: 'MAÑANA', referencia: 'Salmo 91' });
  assert.equal(t, 'ORACIÓN DE LA MAÑANA | DIOS ES MI REFUGIO: RECIBE SU PROTECCIÓN | Salmo 91');
});

test('without a reference it doesn\'t invent one', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'Entrega este nuevo día con fe y empieza con dirección y protección de Dios', franja: 'MAÑANA', referencia: null }),
    'ORACIÓN DE LA MAÑANA | ENTREGA ESTE NUEVO DÍA CON FE Y EMPIEZA CON DIRECCIÓN Y PROTECCIÓN DE DIOS');
});

test('never over 100 characters: first drops the reference, then cuts at a word', () => {
  const largo = 'Dios abrirá el camino delante de ti: confía en Él aunque no sepas qué hacer y entrégale cada paso de tu día';
  const t = tituloEstiloOracion({ titulo: largo, franja: 'MAÑANA', referencia: 'Proverbios 3:5-6' });
  assert.ok([...t].length <= 100, t);
  assert.ok(t.startsWith('ORACIÓN DE LA MAÑANA | DIOS ABRIRÁ EL CAMINO'));
  assert.doesNotMatch(t, /[\s|:,]$/);
});

test('only for the Spanish prayer channel\'s long videos', () => {
  const env = { CONTENT_LANGUAGE: 'es', CHANNEL_THEME: 'prayer' };
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, env), true);
  assert.equal(usaEstiloOracion({ contentFormat: 'short' }, env), false);
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, { ...env, CONTENT_LANGUAGE: 'en' }), false);
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, { ...env, CHANNEL_THEME: 'tech' }), false);
});
