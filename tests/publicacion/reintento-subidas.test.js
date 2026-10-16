// 06/10/2026: a thumbnail and captions that fail (quota) are retried later.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');

test('reintentaPendientes: uploads what\'s pending, clears the flag and spends nothing if the quota is exhausted', async () => {
  const s = {};
  const filas = [{ id: 1, youtube_id: 'V1', metadata: { thumbnail: { path: '/t.jpg' }, captions: { path: '/c.srt' }, pendientesYouTube: { thumbnail: true, captions: true } } }];
  const guardadas = [];
  const db = {
    getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; },
    getAllRows: async () => filas,
    deserializeScheduleEntry: f => ({ ...f, youtubeId: f.youtube_id, youtubeUrl: `https://youtu.be/${f.youtube_id}` }),
    updateScheduleEntry: async e => { guardadas.push(e.metadata.pendientesYouTube); }
  };
  const agente = Object.create(PublishingSchedulingAgent.prototype);
  Object.assign(agente, { db, youtube: {}, logger: { success() {}, warn() {}, info() {}, error() {} } });
  const subidas = [];
  agente.uploadThumbnail = async id => { subidas.push(`t:${id}`); return true; };
  agente.uploadCaptions = async id => { subidas.push(`c:${id}`); return true; };
  s.youtube_cuota_hasta = new Date(Date.now() + 3600000).toISOString();
  assert.equal(await agente.reintentaPendientes(), 0);
  assert.deepEqual(subidas, []);
  s.youtube_cuota_hasta = null;
  assert.equal(await agente.reintentaPendientes(), 1);
  assert.deepEqual(subidas, ['t:V1', 'c:V1']);
  assert.equal(guardadas.at(-1), null);
});
