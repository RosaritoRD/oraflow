const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');

function fakeDb(settings = {}) {
  const rows = [];
  return {
    rows,
    findDuplicatePublicationTitle: async () => null,
    getSetting: async key => settings[key] ?? null,
    getLatestScheduleEntry: async id => rows.find(r => r.productionId === id) || null,
    saveScheduleEntry: async entry => { entry.id = `s${rows.length}`; rows.push(entry); return entry; },
    updateScheduleEntry: async () => {},
    getAllRows: async () => rows.map(r => ({ publish_time: r.publishTime, metadata: JSON.stringify(r.metadata) })),
    getLatestReadinessRun: async () => null
  };
}

function production(id, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-'));
  const video = path.join(dir, 'v.mp4');
  const audio = path.join(dir, 'a.mp3');
  fs.writeFileSync(video, 'x');
  fs.writeFileSync(audio, 'x');
  return {
    id, script: { title: `Oración ${id}` }, scheduledPublishTime: '2030-01-01T14:00:00.000Z',
    assets: { finalVideo: { path: video }, audio: { path: audio } },
    seo: { title: `Oración ${id}`, description: 'd', tags: ['oracion'], categoryId: '22' },
    ...extra
  };
}

function agentWith(db) {
  const agent = new PublishingSchedulingAgent(db, {});
  agent.isNarrationReady = async () => true;
  return agent;
}

test('la cola muestra el título SEO que se enviará a YouTube', async () => {
  const entry = await agentWith(fakeDb()).scheduleContent(production('seo', {
    seo: { title: 'Oración de la noche para descansar' }
  }));
  assert.equal(entry.title, entry.metadata.seo.title);
});

test('cada vídeo largo recibe su propio día a las 04:00 de NY', async () => {
  const db = fakeDb();
  const agent = agentWith(db);
  const a = await agent.scheduleContent(production('p1'));
  const b = await agent.scheduleContent(production('p2'));
  const hourNY = iso => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
  assert.equal(hourNY(a.publishTime), '04:00');
  assert.equal(hourNY(b.publishTime), '04:00');
  assert.notEqual(a.publishTime.slice(0, 10), b.publishTime.slice(0, 10));
  assert.equal(a.metadata.dailySlot, true);
});

test('los Shorts conservan su hora propia', async () => {
  const agent = agentWith(fakeDb());
  const s = await agent.scheduleContent(production('s1', { contentType: 'short', shortClipId: 'c1' }));
  assert.equal(s.publishTime, '2030-01-01T14:00:00.000Z');
  assert.equal(s.metadata.dailySlot, false);
});

test('con daily_publish_enabled=false vuelve al comportamiento anterior', async () => {
  const agent = agentWith(fakeDb({ daily_publish_enabled: 'false' }));
  const e = await agent.scheduleContent(production('p1'));
  assert.equal(e.publishTime, '2030-01-01T14:00:00.000Z');
});

test('se sube por adelantado, privado y con publishAt = la hora del hueco', async () => {
  const db = fakeDb();
  const agent = agentWith(db);
  const entry = await agent.scheduleContent(production('p1'));
  const sent = [];
  agent.youtube = { videos: { insert: async req => { sent.push(req.requestBody); return { data: { id: 'yt1' } }; } } };
  agent.getVideoStream = async () => 'stream';
  agent.uploadThumbnail = async () => {};
  agent.uploadCaptions = async () => {};

  const hoursAhead = (new Date(entry.publishTime) - Date.now()) / 3600000;
  const published = await agent.processPublishQueue();
  if (hoursAhead <= 12) {
    assert.equal(published, 1);
    assert.equal(sent[0].status.privacyStatus, 'private');
    assert.equal(sent[0].status.publishAt, entry.publishTime);
  } else {
    assert.equal(published, 0, 'fuera de la ventana de 12 h todavía no se sube');
  }
});
