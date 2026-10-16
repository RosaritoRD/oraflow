const test = require('node:test');
const assert = require('node:assert/strict');
const { franjaDe, franjaDelContenido, corrigeFranja } = require('../../utils/franja');

const TITULO_27 = 'ORACIÓN DE LA MAÑANA — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS';
const GUION_27 = { title: 'Oración corta de la noche para entregar todo a Dios y dormir en paz' };

test('case 27/09: night script => the title becomes ORACIÓN DE LA NOCHE', () => {
  const t = corrigeFranja(TITULO_27, franjaDelContenido(GUION_27, {}));
  assert.equal(t, 'ORACIÓN DE LA NOCHE — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS');
});

test('morning script: the title doesn\'t change', () => {
  assert.equal(corrigeFranja(TITULO_27, franjaDelContenido({ title: 'Oración de la mañana para empezar con fe' })), TITULO_27);
});

test('script without a time of day: the title isn\'t touched', () => {
  assert.equal(corrigeFranja(TITULO_27, franjaDelContenido({ title: 'Oración por mi familia' }, { topic: 'Protección' })), TITULO_27);
});

test('without a script title, the topic is used', () => {
  assert.equal(franjaDelContenido({}, { topic: 'Entregar todo a Dios antes de dormir' }), 'NOCHE');
});

test('keeps lower case if the title isn\'t in capitals', () => {
  assert.equal(corrigeFranja('Oración de la mañana | Paz', 'NOCHE'), 'Oración de la noche | Paz');
});

test('franjaDe: "tarde" as a word, not inside another', () => {
  assert.equal(franjaDe('Oración de la tarde'), 'TARDE');
  assert.equal(franjaDe('Oración para descansar'), null);
});
