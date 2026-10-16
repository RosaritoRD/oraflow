// 29/09/2026: 2 long videos (04:00 morning, 18:30 evening) + 2 Shorts
// (07:00 morning, 21:00 evening) a day, New York time.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { nextFreeSlot, parseClocks, franjaDeHora, fechaDelEncargo } = require('../../utils/daily-slot');
const { lienzo, esShort } = require('../../utils/formato');
const { franjaDelContenido } = require('../../utils/franja');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');
const { DailyAutomation } = require('../../schedules/daily-automation');

const NY = 'America/New_York';
const hourNY = iso => new Intl.DateTimeFormat('en-US', { timeZone: NY, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

test('parseClocks sorts, normalizes and drops what isn\'t a time', () => {
  assert.deepEqual(parseClocks('18:30, 4:00,xx'), ['04:00', '18:30']);
  assert.deepEqual(parseClocks('', '07:00,21:00'), ['07:00', '21:00']);
});

test('time of day by hour: 04:00 and 07:00 morning, 18:30 and 21:00 night', () => {
  assert.equal(franjaDeHora('04:00'), 'MAÑANA');
  assert.equal(franjaDeHora('07:00'), 'MAÑANA');
  assert.equal(franjaDeHora('18:30'), 'NOCHE');
  assert.equal(franjaDeHora('21:00'), 'NOCHE');
});

test('at 13:00 the next slot is today\'s 18:30', () => {
  const now = new Date('2026-09-29T17:00:00Z'); // 13:00 NY
  const slot = nextFreeSlot({ now, timeZone: NY, clocks: ['04:00', '18:30'] });
  assert.deepEqual(slot, { publishTime: '2026-09-29T22:30:00.000Z', clock: '18:30', franja: 'NOCHE' });
});

test('with the evening taken it moves to the next morning', () => {
  const now = new Date('2026-09-29T17:00:00Z');
  const slot = nextFreeSlot({ now, timeZone: NY, clocks: ['04:00', '18:30'], taken: ['2026-09-29T22:30:00.000Z'] });
  assert.equal(slot.publishTime, '2026-09-30T08:00:00.000Z');
  assert.equal(slot.franja, 'MAÑANA');
});

test('a manual video mid-morning takes the morning slot, not the evening one', () => {
  const now = new Date('2026-09-29T03:00:00Z'); // 23:00 NY on the 28th
  const slot = nextFreeSlot({ now, timeZone: NY, clocks: ['04:00', '18:30'], taken: ['2026-09-29T14:33:00.000Z'] }); // 10:33 NY
  assert.equal(slot.publishTime, '2026-09-29T22:30:00.000Z');
});

test('the clock change doesn\'t move 18:30', () => {
  const now = new Date('2026-11-01T12:00:00Z'); // the day the clocks change (EST from 02:00)
  const slot = nextFreeSlot({ now, timeZone: NY, clocks: ['04:00', '18:30'] });
  assert.equal(hourNY(slot.publishTime), '18:30');
  assert.equal(slot.publishTime, '2026-11-01T23:30:00.000Z');
});

test('Short = 1080x1920 vertical; long = the one in .env', () => {
  assert.deepEqual(lienzo('short'), { aspectRatio: '9:16', resolution: '1080x1920' });
  assert.deepEqual(lienzo('long', {}), { aspectRatio: '16:9', resolution: '1920x1080' });
  assert.equal(esShort({ contentFormat: 'short' }), true);
  assert.equal(esShort({}), false);
});

test('the title\'s date is the job\'s slot date', () => {
  assert.equal(fechaDelEncargo({ publishSlot: '2026-09-29T22:30:00.000Z' }).toISOString(), '2026-09-29T22:30:00.000Z');
});

test('the slot\'s time of day counts if the script says none', () => {
  assert.equal(franjaDelContenido({ title: 'Oración por mi familia' }, { franja: 'NOCHE' }), 'NOCHE');
  assert.equal(franjaDelContenido({ title: 'Oración de la mañana' }, { franja: 'NOCHE' }), 'MAÑANA');
});

// ── Publishing ──────────────────────────────────────────────────────────────

function fakeDb(settings = {}) {
  const rows = [];
  return {
    rows,
    getSetting: async key => settings[key] ?? null,
    getLatestScheduleEntry: async id => rows.find(r => r.productionId === id) || null,
    saveScheduleEntry: async entry => { entry.id = `s${rows.length}`; rows.push(entry); return entry; },
    updateScheduleEntry: async () => {},
    getAllRows: async () => rows.map(r => ({ publish_time: r.publishTime, metadata: JSON.stringify(r.metadata) })),
    getLatestReadinessRun: async () => null
  };
}

function production(id, strategy = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-'));
  const video = path.join(dir, 'v.mp4');
  const audio = path.join(dir, 'a.mp3');
  fs.writeFileSync(video, 'x');
  fs.writeFileSync(audio, 'x');
  return {
    id, strategy, script: { title: `Oración ${id}` },
    assets: { finalVideo: { path: video }, audio: { path: audio } },
    seo: { title: `Oración ${id}`, description: 'd', tags: ['oracion'], categoryId: '22' }
  };
}

function agentWith(db) {
  const agent = new PublishingSchedulingAgent(db, {});
  agent.isNarrationReady = async () => true;
  return agent;
}

test('long videos at 04:00 and 18:30, alternating', async () => {
  const agent = agentWith(fakeDb({ daily_publish_time: '04:00,18:30' }));
  const horas = [];
  for (const id of ['a', 'b', 'c']) horas.push(hourNY((await agent.scheduleContent(production(id))).publishTime));
  assert.ok(horas.every(h => ['04:00', '18:30'].includes(h)));
  assert.ok(horas.filter(h => h === '04:00').length >= 1 && horas.filter(h => h === '18:30').length >= 1);
});

test('Shorts go at their times (07:00 / 21:00) and don\'t take the long videos\' slots', async () => {
  const db = fakeDb({ daily_publish_time: '04:00,18:30' });
  const agent = agentWith(db);
  const s1 = await agent.scheduleContent(production('s1', { contentFormat: 'short' }));
  const s2 = await agent.scheduleContent(production('s2', { contentFormat: 'short' }));
  assert.deepEqual([hourNY(s1.publishTime), hourNY(s2.publishTime)].sort(), ['07:00', '21:00']);
  assert.equal(s1.metadata.contentFormat, 'short');
  assert.equal(s1.metadata.dailySlot, true);
  const largo = await agent.scheduleContent(production('l1'));
  assert.ok(['04:00', '18:30'].includes(hourNY(largo.publishTime)));
  assert.equal(largo.metadata.contentFormat, 'long');
});

test('the slot the scheduler assigned to the job is respected', async () => {
  const agent = agentWith(fakeDb({ daily_publish_time: '04:00,18:30' }));
  const slot = nextFreeSlot({ now: new Date(Date.now() + 2 * 86400000), timeZone: NY, clocks: ['04:00', '18:30'] }).publishTime;
  const e = await agent.scheduleContent(production('x', { publishSlot: slot }));
  assert.equal(e.publishTime, slot);
});

test('daily_shorts_time=off: Shorts fall on the long videos\' times', async () => {
  const agent = agentWith(fakeDb({ daily_publish_time: '04:00,18:30', daily_shorts_time: 'off' }));
  const cfg = await agent.dailySlotConfig();
  assert.deepEqual(cfg.shortClocks, []);
  assert.deepEqual(cfg.clocks, ['04:00', '18:30']);
});

// ── Programador ─────────────────────────────────────────────────────────────

function automation({ taken = {}, attempts = 0, daily }) {
  const db = {
    getRow: async sql => ({ count: sql.includes("IN ('queued', 'running')") ? 0 : attempts })
  };
  const publishing = {
    dailySlotConfig: async () => daily,
    takenDailySlots: async format => taken[format] || []
  };
  return new DailyAutomation({ publishing }, db);
}

const DAILY = { timeZone: NY, clock: '04:00', clocks: ['04:00', '18:30'], shortClocks: ['07:00', '21:00'] };

test('the scheduler picks the nearest empty slot and passes it to the job', async () => {
  const a = automation({ daily: DAILY });
  assert.equal(await a.shouldGenerateContentToday(), true);
  const t = a.lastDailyTarget;
  assert.ok(['long', 'short'].includes(t.format));
  const nextLong = nextFreeSlot({ timeZone: NY, clocks: DAILY.clocks }).publishTime;
  const nextShort = nextFreeSlot({ timeZone: NY, clocks: DAILY.shortClocks }).publishTime;
  assert.equal(t.publishTime, nextLong < nextShort ? nextLong : nextShort);
});

test('with everything covered for 24 h it doesn\'t generate', async () => {
  const taken = { long: [], short: [] };
  // takes the next 3 slots of each format (more than covers 24 h)
  for (const [format, clocks] of [['long', DAILY.clocks], ['short', DAILY.shortClocks]]) {
    for (let i = 0; i < 3; i++) taken[format].push(nextFreeSlot({ timeZone: NY, clocks, taken: taken[format] }).publishTime);
  }
  const a = automation({ daily: DAILY, taken });
  assert.equal(await a.shouldGenerateContentToday(), false);
});

test('a slot with 3 failed attempts is skipped', async () => {
  const a = automation({ daily: DAILY, attempts: 3 });
  assert.equal(await a.shouldGenerateContentToday(), false);
});

test('the scheduler\'s job carries format, time of day and slot', async () => {
  let recibido = null;
  const a = automation({ daily: DAILY });
  a.generateContent = async input => { recibido = input; return { id: 'job1' }; };
  a.db.setSetting = async () => {};
  a.logAutomationEvent = async () => {};
  await a.runDailyContentGeneration();
  assert.equal(recibido.source, 'scheduler');
  assert.equal(recibido.strategyContext.publishSlot, a.lastDailyTarget.publishTime);
  assert.equal(recibido.strategyContext.format, a.lastDailyTarget.format);
  assert.ok(['MAÑANA', 'NOCHE'].includes(recibido.strategyContext.franja));
});
