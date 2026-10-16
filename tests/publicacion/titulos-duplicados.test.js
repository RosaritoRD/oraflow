const test = require('node:test');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { Database } = require('../../database/db');
const { OperatorService } = require('../../utils/operator-service');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');

async function database(t) {
  const db = new Database();
  db.db = new sqlite3.Database(':memory:');
  t.after(() => new Promise((resolve, reject) => db.db.close(e => e ? reject(e) : resolve())));
  await db.executeQuery('CREATE TABLE publish_schedule (id TEXT, production_id TEXT, title TEXT, status TEXT, youtube_id TEXT, metadata TEXT)');
  return db;
}

async function add(db, { id = 'previous', title = 'ORACIÓN: para dormir en paz 🙏', seo, status = 'scheduled', youtubeId = null } = {}) {
  await db.executeQuery('INSERT INTO publish_schedule VALUES (?, ?, ?, ?, ?, ?)',
    [id, id, title, status, youtubeId, JSON.stringify(seo ? { seo: { title: seo } } : {})]);
}

test('blocks a repeated final title, even if accents, emojis or punctuation change', async t => {
  const db = await database(t);
  await add(db, { title: 'Título interno diferente', seo: 'ORACIÓN: para dormir en paz 🙏' });
  const quality = await new OperatorService(db).runQualityChecks({
    id: 'new', seo: { title: 'Oracion para dormir en paz 🌙' }, script: {}, assets: {}
  });
  assert.ok(quality.blockingFailures.includes('duplicate_title'));
  assert.match(quality.checks.find(c => c.id === 'duplicate_title').message, /previous/);
});

test('excludes the same production and cancelled attempts without a YouTube video', async t => {
  const db = await database(t);
  await add(db);
  await add(db, { id: 'cancelled', status: 'cancelled' });
  await add(db, { id: 'failed', status: 'failed' });
  assert.equal(await db.findDuplicatePublicationTitle('Oración para dormir en paz', 'previous'), null);
});

test('remembers published and uploaded ones even if local state failed', async t => {
  const db = await database(t);
  await add(db, { status: 'failed', youtubeId: 'youtube-existing' });
  assert.equal((await db.findDuplicatePublicationTitle('Oracion para dormir en paz')).productionId, 'previous');
});

test('doesn\'t confuse chapters, negations or edited SEO titles', async t => {
  const db = await database(t);
  await add(db, { title: 'Salmo 4:8', seo: 'Oración para no rendirte' });
  assert.equal(await db.findDuplicatePublicationTitle('Salmo 4:8'), null);
  assert.equal(await db.findDuplicatePublicationTitle('Oración para rendirte'), null);
  await add(db, { id: 'psalm', title: 'Salmo 4:8' });
  assert.equal(await db.findDuplicatePublicationTitle('Salmo 48'), null);
});

test('checks duplicates again before uploading and doesn\'t touch YouTube', async t => {
  const db = await database(t);
  await add(db, { status: 'published' });
  const agent = new PublishingSchedulingAgent(db, {});
  db.getLatestReadinessRun = async () => null;
  db.getProductionBundle = async () => null;
  agent.isNarrationReady = async () => true;
  let uploads = 0;
  agent.uploadToYouTube = async () => { uploads++; };
  agent.publishQueue = [{ id: 'schedule-new', productionId: 'new', status: 'scheduled', metadata: { seo: { title: 'Oracion para dormir en paz' } } }];
  await assert.rejects(agent.publishContent('new'), { code: 'DUPLICATE_TITLE', status: 409 });
  assert.equal(uploads, 0);
  assert.equal(agent.publishQueue[0].status, 'scheduled');
});
