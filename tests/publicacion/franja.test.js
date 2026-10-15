const test = require('node:test');
const assert = require('node:assert/strict');
const { franjaDe, franjaDelContenido, corrigeFranja } = require('../../utils/franja');

const TITULO_27 = 'ORACIÓN DE LA MAÑANA — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS';
const GUION_27 = { title: 'Oración corta de la noche para entregar todo a Dios y dormir en paz' };

test('caso 27/09: guion de noche => el título pasa a ORACIÓN DE LA NOCHE', () => {
  const t = corrigeFranja(TITULO_27, franjaDelContenido(GUION_27, {}));
  assert.equal(t, 'ORACIÓN DE LA NOCHE — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS');
});

test('guion de mañana: el título no cambia', () => {
  assert.equal(corrigeFranja(TITULO_27, franjaDelContenido({ title: 'Oración de la mañana para empezar con fe' })), TITULO_27);
});

test('guion sin franja: el título no se toca', () => {
  assert.equal(corrigeFranja(TITULO_27, franjaDelContenido({ title: 'Oración por mi familia' }, { topic: 'Protección' })), TITULO_27);
});

test('sin título de guion, se usa el tema', () => {
  assert.equal(franjaDelContenido({}, { topic: 'Entregar todo a Dios antes de dormir' }), 'NOCHE');
});

test('respeta minúsculas si el título no va en mayúsculas', () => {
  assert.equal(corrigeFranja('Oración de la mañana | Paz', 'NOCHE'), 'Oración de la noche | Paz');
});

test('franjaDe: "tarde" como palabra, no dentro de otra', () => {
  assert.equal(franjaDe('Oración de la tarde'), 'TARDE');
  assert.equal(franjaDe('Oración para descansar'), null);
});
