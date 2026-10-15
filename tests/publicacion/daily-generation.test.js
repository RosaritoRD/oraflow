const test = require('node:test');
const assert = require('node:assert/strict');
const { DailyAutomation } = require('../../schedules/daily-automation');
const { nextDailySlot } = require('../../utils/daily-slot');

const daily = { timeZone: 'America/New_York', clock: '04:00' };

function automation({ running = 0, attempts = 0, taken = [] } = {}) {
  const db = {
    getRow: async sql => ({ count: sql.includes("IN ('queued', 'running')") ? running : attempts })
  };
  const publishing = { dailySlotConfig: async () => daily, takenDailySlots: async () => taken };
  return new DailyAutomation({ publishing }, db);
}

test('genera si el próximo hueco está vacío', async () => {
  assert.equal(await automation().shouldGenerateContentToday(), true);
});

test('no genera si el próximo hueco ya tiene vídeo', async () => {
  const taken = [nextDailySlot(daily)];
  assert.equal(await automation({ taken }).shouldGenerateContentToday(), false);
});

test('no lanza otra generación si hay una en marcha', async () => {
  assert.equal(await automation({ running: 1 }).shouldGenerateContentToday(), false);
});

test('tope de 3 intentos del programador al día', async () => {
  assert.equal(await automation({ attempts: 3 }).shouldGenerateContentToday(), false);
});
