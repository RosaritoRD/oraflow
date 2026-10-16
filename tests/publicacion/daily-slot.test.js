const test = require('node:test');
const assert = require('node:assert/strict');
const { nextDailySlot, localDateKey, parseClock, uploadPlan } = require('../../utils/daily-slot');

const NY = 'America/New_York';

test('parseClock accepts HH:MM and rejects garbage', () => {
  assert.deepEqual(parseClock('04:00'), { hour: 4, minute: 0 });
  assert.deepEqual(parseClock('4:30'), { hour: 4, minute: 30 });
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('hola'), null);
});

test('at 02:05 NY the next slot is TODAY at 04:00 (EDT = 08:00Z)', () => {
  const now = new Date('2026-09-24T06:05:00Z'); // 02:05 EDT
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', minLeadMinutes: 60 }), '2026-09-24T08:00:00.000Z');
});

test('without enough margin it jumps to the next day', () => {
  const now = new Date('2026-09-24T07:30:00Z'); // 03:30 EDT, faltan 30 min
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', minLeadMinutes: 60 }), '2026-09-25T08:00:00.000Z');
});

test('at 06:00 (daily generation) it targets tomorrow 04:00', () => {
  const now = new Date('2026-09-24T10:00:00Z'); // 06:00 EDT
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-09-25T08:00:00.000Z');
});

test('in winter time (EST) 04:00 is 09:00Z', () => {
  const now = new Date('2026-12-10T15:00:00Z');
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-12-11T09:00:00.000Z');
});

test('crosses the November clock change without drifting', () => {
  const now = new Date('2026-10-31T12:00:00Z'); // Saturday; on Sunday 1/11 the clock goes back
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00' }), '2026-11-01T09:00:00.000Z');
});

test('skips days that already have a video', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  const taken = ['2026-09-25T08:00:00.000Z', '2026-09-26T08:00:00.000Z'];
  assert.equal(nextDailySlot({ now, timeZone: NY, clock: '04:00', taken }), '2026-09-27T08:00:00.000Z');
});

test('localDateKey uses the NY day, not the UTC one', () => {
  assert.equal(localDateKey(new Date('2026-09-24T03:00:00Z'), NY), '2026-09-23');
  assert.equal(localDateKey(new Date('2026-09-24T05:00:00Z'), NY), '2026-09-24');
});

test('uploadPlan: future slot → private with an exact publishAt', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  assert.deepEqual(uploadPlan({ publishTime: '2026-09-25T08:00:00.000Z', now }), {
    privacyStatus: 'private', publishAt: '2026-09-25T08:00:00.000Z'
  });
});

test('uploadPlan: slot already past (VPS down) → goes out in 10 minutes, doesn\'t stay private', () => {
  const now = new Date('2026-09-25T08:30:00Z');
  assert.deepEqual(uploadPlan({ publishTime: '2026-09-25T08:00:00.000Z', now }), {
    privacyStatus: 'private', publishAt: '2026-09-25T08:40:00.000Z'
  });
});

const { fechaDePublicacion } = require('../../utils/daily-slot');

test('the video generated at 06:00 carries TOMORROW\'s date (the day it goes out)', () => {
  const now = new Date('2026-09-24T10:00:00Z'); // jueves 24, 06:00 EDT
  const fecha = fechaDePublicacion(now, {});
  assert.equal(localDateKey(fecha, NY), '2026-09-25');
});

test('generated in the early hours, before 04:00, it carries TODAY\'s date', () => {
  const now = new Date('2026-09-24T06:05:00Z'); // 02:05 EDT
  assert.equal(localDateKey(fechaDePublicacion(now, {}), NY), '2026-09-24');
});

test('DAILY_PUBLISH=off goes back to today\'s date', () => {
  const now = new Date('2026-09-24T10:00:00Z');
  assert.equal(fechaDePublicacion(now, { DAILY_PUBLISH: 'off' }), now);
});
