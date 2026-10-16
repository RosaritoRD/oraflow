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

test('generates if the next slot is empty', async () => {
  assert.equal(await automation().shouldGenerateContentToday(), true);
});

test('doesn\'t generate if the next slot already has a video', async () => {
  const taken = [nextDailySlot(daily)];
  assert.equal(await automation({ taken }).shouldGenerateContentToday(), false);
});

test('doesn\'t start another generation if one is running', async () => {
  assert.equal(await automation({ running: 1 }).shouldGenerateContentToday(), false);
});

test('cap of 3 scheduler attempts per day', async () => {
  assert.equal(await automation({ attempts: 3 }).shouldGenerateContentToday(), false);
});
