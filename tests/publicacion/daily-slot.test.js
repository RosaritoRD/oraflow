const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDailySlot, localDateKey, parseClock, uploadPlan } = require('../../utils/daily-slot');

const NY = 'America/New_York';

test('parseClock acepta HH:MM y rechaza basura', () => {
  assert.deepEqual(parseClock('04:00'), { hour: 4, minute: 0 });
  assert.deepEqual(parseClock('4:30'), { hour: 4, minute: 30 });
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('hola'), null);
});

test('a las 02:05 de NY el siguiente hueco es HOY a las 04:00 (EDT = 08:00Z)', () => {
  const now = new Date('2026-09-24T06:05:00Z'); // 02:05 EDT
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', minLeadMinutes: 60 }), '2026-09-24T08:00:00.000Z');
});

test('sin margen suficiente salta al día siguiente', () => {
  const now = new Date('2026-09-24T07:30:00Z'); // 03:30 EDT, faltan 30 min
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', minLeadMinutes: 60 }), '2026-09-25T08:00:00.000Z');
});

test('a las 06:00 (generación diaria) apunta a mañana 04:00', () => {
  const now = new Date('2026-09-24T10:00:00Z'); // 06:00 EDT
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-09-25T08:00:00.000Z');
});

test('en horario de invierno (EST) las 04:00 son las 09:00Z', () => {
  const now = new Date('2026-12-10T15:00:00Z');
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-12-11T09:00:00.000Z');
});

test('cruza el cambio de hora de noviembre sin desfasarse', () => {
  const now = new Date('2026-10-31T12:00:00Z'); // sábado; el domingo 1/11 se atrasa la hora
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-11-01T09:00:00.000Z');
});

test('salta los días que ya tienen vídeo', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const taken = ['2026-09-25T08:00:00.000Z', '2026-09-26T08:00:00.000Z'];
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', taken }), '2026-09-27T08:00:00.000Z');
});

test('localDateKey usa el día de NY, no el de UTC', () => {
  assert.equal(localDateKey(new Date('2026-09-24T03:00:00Z'), NY), '2026-09-23');
  assert.equal(localDateKey(new Date('2026-09-24T05:00:00Z'), NY), '2026-09-24');
});

test('uploadPlan: hueco futuro → privado con publishAt exacto', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  assert.deepEqual(uploadPlan({ publishTime: '2026-09-25T08:00:00.000Z', now }), {
    privacyStatus: 'private', publishAt: '2026-09-25T08:00:00.000Z'
  });
});

test('uploadPlan: hueco ya pasado (VPS caída) → sale en 10 minutos, no se queda privado', () => {
  const now = new Date('2026-09-25T08:30:00Z');
  assert.deepEqual(uploadPlan({ publishTime: '2026-09-25T08:00:00.000Z', now }), {
    privacyStatus: 'private', publishAt: '2026-09-25T08:40:00.000Z'
  });
});

const { fechaDePublicacion } = require('../../utils/daily-slot');

test('el vídeo generado a las 06:00 lleva la fecha de MAÑANA (día en que sale)', () => {
  const now = new Date('2026-09-24T10:00:00Z'); // jueves 24, 06:00 EDT
  const fecha = fechaDePublicacion(now, {});
  assert.equal(localDateKey(fecha, NY), '2026-09-25');
});

test('generado de madrugada, antes de las 04:00, lleva la fecha de HOY', () => {
  const now = new Date('2026-09-24T06:05:00Z'); // 02:05 EDT
  assert.equal(localDateKey(fechaDePublicacion(now, {}), NY), '2026-09-24');
});

test('DAILY_PUBLISH=off vuelve a la fecha de hoy', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  assert.equal(fechaDePublicacion(now, { DAILY_PUBLISH: 'off' }), now);
});
