// 02/10/2026: «ORACIÓN DE LA MAÑANA — JUEVES 1 DE OCTUBRE | SALMO 118:24 RECIBE PAZ, FE
// Y GRATITUD PARA HOY» se publicó así: cuando la IA de SEO falla, el respaldo usa el
// título del guion tal cual. Red de seguridad al final, venga de donde venga.
const test = require('node:test');
const assert = require('node:assert/strict');
const { tituloLimpio } = require('../../utils/titulo-limpio');

test('quita día de la semana, fecha y «para hoy», y deja de gritar', () => {
  assert.equal(
    tituloLimpio('ORACIÓN DE LA MAÑANA — JUEVES 1 DE OCTUBRE | SALMO 118:24 RECIBE PAZ, FE Y GRATITUD PARA HOY'),
    'Oración de la mañana | Salmo 118:24 recibe paz, fe y gratitud'
  );
});

test('fechas sueltas también', () => {
  assert.equal(tituloLimpio('Oración de la noche 25 de septiembre para dormir en paz 🌙🙏'), 'Oración de la noche para dormir en paz 🌙🙏');
  assert.equal(tituloLimpio('Oración de hoy: domingo 27 de septiembre | Salmo 23'), 'Oración de hoy | Salmo 23');
});

test('un título bueno no se toca', () => {
  for (const t of ['Oración de la mañana para cuidar tus palabras ☀️🙏', 'Oración poderosa de protección para tu familia 🙏', 'Oración de la noche: en paz me acostaré (Salmo 4:8) 🙏']) {
    assert.equal(tituloLimpio(t), t);
  }
});

test('al quitar las mayúsculas respeta Dios, Señor, Jesús y los libros de la Biblia', () => {
  assert.equal(tituloLimpio('ORACIÓN PARA ENTREGAR TUS CARGAS A DIOS Y AL SEÑOR JESÚS | SALMO 55:22'), 'Oración para entregar tus cargas a Dios y al Señor Jesús | Salmo 55:22');
});
