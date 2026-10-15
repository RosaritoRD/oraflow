// 03/10/2026: el autor pidió los títulos como los canales grandes del nicho
// (@AbrazoDivino 219K, Sol Naciente 33K):
//   «ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27»
// Cabecera fija con la franja, la PROMESA del pasaje y lo que el oyente recibe
// en mayúsculas, y la cita al final en minúscula. Sigue sin fecha.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tituloEstiloOracion, usaEstiloOracion } = require('../../utils/titulo-oracion');

test('arma el formato completo a partir de la frase de la IA', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'El Señor es mi luz y mi salvación: no temas lo que traiga este día ☀️🙏', franja: 'MAÑANA', referencia: 'Salmo 27' }),
    'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27');
});

test('un título que ya viene en el formato no cambia', () => {
  const t = 'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ Y MI SALVACIÓN: NO TEMAS LO QUE TRAIGA ESTE DÍA | Salmo 27';
  assert.equal(tituloEstiloOracion({ titulo: t, franja: 'MAÑANA', referencia: 'Salmo 27' }), t);
});

test('si con la cita pasa de 100, va sin cita (como hizo Sol Naciente con Salmo 32:8)', () => {
  const t = tituloEstiloOracion({ titulo: 'Dios abrirá el camino: confía en Él aunque no sepas qué hacer hoy', franja: 'MAÑANA', referencia: 'Salmo 32:8' });
  assert.equal(t, 'ORACIÓN DE LA MAÑANA | DIOS ABRIRÁ EL CAMINO: CONFÍA EN ÉL AUNQUE NO SEPAS QUÉ HACER HOY');
});

test('la franja la manda el contenido y la cita sale de la referencia del guion', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'Oración de la mañana | En paz me acostaré: descansa en Dios esta noche | Salmos 4:8', franja: 'NOCHE', referencia: 'Salmos 4:8' }),
    'ORACIÓN DE LA NOCHE | EN PAZ ME ACOSTARÉ: DESCANSA EN DIOS ESTA NOCHE | Salmo 4:8');
});

test('nunca una fecha ni un día de la semana', () => {
  const t = tituloEstiloOracion({ titulo: 'ORACIÓN DE LA MAÑANA — JUEVES 1 DE OCTUBRE | Dios es mi refugio: recibe su protección', franja: 'MAÑANA', referencia: 'Salmo 91' });
  assert.equal(t, 'ORACIÓN DE LA MAÑANA | DIOS ES MI REFUGIO: RECIBE SU PROTECCIÓN | Salmo 91');
});

test('sin referencia no inventa ninguna', () => {
  assert.equal(
    tituloEstiloOracion({ titulo: 'Entrega este nuevo día con fe y empieza con dirección y protección de Dios', franja: 'MAÑANA', referencia: null }),
    'ORACIÓN DE LA MAÑANA | ENTREGA ESTE NUEVO DÍA CON FE Y EMPIEZA CON DIRECCIÓN Y PROTECCIÓN DE DIOS');
});

test('nunca pasa de 100 caracteres: primero sacrifica la cita, después corta en palabra', () => {
  const largo = 'Dios abrirá el camino delante de ti: confía en Él aunque no sepas qué hacer y entrégale cada paso de tu día';
  const t = tituloEstiloOracion({ titulo: largo, franja: 'MAÑANA', referencia: 'Proverbios 3:5-6' });
  assert.ok([...t].length <= 100, t);
  assert.ok(t.startsWith('ORACIÓN DE LA MAÑANA | DIOS ABRIRÁ EL CAMINO'));
  assert.doesNotMatch(t, /[\s|:,]$/);
});

test('solo para los vídeos largos del canal de oración en español', () => {
  const env = { CONTENT_LANGUAGE: 'es', CHANNEL_THEME: 'prayer' };
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, env), true);
  assert.equal(usaEstiloOracion({ contentFormat: 'short' }, env), false);
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, { ...env, CONTENT_LANGUAGE: 'en' }), false);
  assert.equal(usaEstiloOracion({ contentFormat: 'long' }, { ...env, CHANNEL_THEME: 'tech' }), false);
});
