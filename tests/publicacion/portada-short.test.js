// 11/10/2026: the Short's cover no longer goes glued inside the video (it lowered
// views). Now it's set as the thumbnail on YouTube and as the Reel cover on Instagram,
// through the API. Tested by hand that day with one of the channel's Shorts on both.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');
const { preparaReelIG } = require('../../utils/instagram-reels');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portada-short-'));
const PORTADA = path.join(dir, 's1_portada.jpg');
const VIDEO = path.join(dir, 's1.mp4');
fs.writeFileSync(PORTADA, 'jpg');
fs.writeFileSync(VIDEO, 'mp4');
const SEO = { title: 'Oración para dormir en paz', description: 'd', tags: ['oracion'], categoryId: '22' };

function agente({ producciones = {} } = {}) {
  const guardadas = [];
  const db = {
    getSetting: async () => null,
    setSetting: async () => {},
    updateScheduleEntry: async (e) => guardadas.push(JSON.parse(JSON.stringify(e))),
    getAllRows: async (sql, params) => (/FROM productions/.test(sql) && producciones[params[0]]
      ? [{ assets: JSON.stringify(producciones[params[0]]) }] : [])
  };
  const a = Object.create(PublishingSchedulingAgent.prototype);
  Object.assign(a, { db, logger: { info() {}, warn() {}, error() {}, success() {} } });
  const miniaturas = [];
  a.youtube = { videos: { insert: async () => ({ data: { id: 'yt1' } }) } };
  a.getVideoStream = async () => 'stream';
  a.uploadThumbnail = async (id, ruta) => { miniaturas.push([id, ruta]); return true; };
  a.uploadCaptions = async () => true;
  return { a, miniaturas, guardadas };
}

const entrada = (metadata = {}, extra = {}) => ({
  id: 's1', productionId: 'prod_s1', publishTime: '2030-01-01T14:00:00.000Z', status: 'scheduled',
  metadata: { seo: SEO, video: { path: VIDEO }, contentFormat: 'short', thumbnail: null, ...metadata }, ...extra
});

test('YouTube: a freshly uploaded Short carries its cover as the thumbnail', async () => {
  const { a, miniaturas } = agente();
  await a.uploadToYouTube(entrada({ shortCover: { path: PORTADA } }));
  assert.deepEqual(miniaturas, [['yt1', PORTADA]]);
});

test('YouTube: a Short scheduled before the change looks for the cover in its production', async () => {
  const { a, miniaturas } = agente({ producciones: { prod_s1: { shortCover: { path: PORTADA } } } });
  await a.uploadToYouTube(entrada());
  assert.deepEqual(miniaturas, [['yt1', PORTADA]]);
});

test('YouTube: without a cover (or with a broken path) it isn\'t tried and doesn\'t stay pending', async () => {
  const { a, miniaturas, guardadas } = agente();
  await a.uploadToYouTube(entrada({ shortCover: { path: path.join(dir, 'no-existe.jpg') } }));
  assert.deepEqual(miniaturas, []);
  assert.equal(guardadas.at(-1).metadata.pendientesYouTube, undefined, 'reintentar no crearía el archivo');
});

test('YouTube: a long video still uses its thumbnail, not the cover', async () => {
  const { a, miniaturas } = agente();
  await a.uploadToYouTube(entrada({ contentFormat: 'long', thumbnail: { path: '/m.jpg' }, shortCover: { path: PORTADA } }));
  assert.deepEqual(miniaturas, [['yt1', '/m.jpg']]);
});

test('YouTube: if the cover failed (quota), the retry uploads it again', async () => {
  const { a, miniaturas } = agente();
  const fila = { ...entrada({ shortCover: { path: PORTADA }, pendientesYouTube: { thumbnail: true } }), youtube_id: 'yt1' };
  a.db.getAllRows = async (sql) => (/publish_schedule/.test(sql) ? [fila] : []);
  a.db.deserializeScheduleEntry = (f) => ({ ...f, youtubeId: f.youtube_id, youtubeUrl: 'https://youtu.be/yt1' });
  assert.equal(await a.reintentaPendientes(), 1);
  assert.deepEqual(miniaturas, [['yt1', PORTADA]]);
});

test('Instagram: the Reel is created with its cover and both public copies are deleted on publishing', async () => {
  const { a } = agente();
  const e = entrada({ shortCover: { path: PORTADA } }, { status: 'published', publishTime: '2026-10-12T09:00:00.000Z' });
  const env = { INSTAGRAM_TOKEN: 'I' };
  const enlace = { dir, base: 'https://x/ig-media' };
  const publicadas = [];
  const borradas = [];
  const copias = {
    publica: async (ruta) => { publicadas.push(ruta); const n = ruta === PORTADA ? 'p1.jpg' : 'v1.mp4'; return { nombre: n, url: `https://x/ig-media/${n}` }; },
    borra: async (n) => borradas.push(n)
  };
  let enviado = null;
  let estado = 'FINISHED';
  const ig = {
    prepara: async (args) => { enviado = args; return { containerId: 'C1', igUserId: 'IG1' }; },
    estado: async () => ({ status: estado }),
    publica: async () => ({ mediaId: 'M1', permalink: 'https://www.instagram.com/reel/x/' })
  };
  await a.syncSocial(e, { env, now: new Date('2026-10-11T21:00:00Z'), ig, copias, enlace });
  assert.deepEqual(publicadas, [VIDEO, PORTADA]);
  assert.equal(enviado.videoUrl, 'https://x/ig-media/v1.mp4');
  assert.equal(enviado.coverUrl, 'https://x/ig-media/p1.jpg');
  assert.equal(e.metadata.instagram.copiaPortada, 'p1.jpg');
  await a.syncSocial(e, { env, now: new Date('2026-10-12T09:05:00Z'), ig, copias, enlace });
  assert.equal(e.metadata.instagram.status, 'published');
  assert.deepEqual(borradas, ['v1.mp4', 'p1.jpg']);
});

test('Instagram: if copying the cover fails, the Reel goes out anyway, without a cover', async () => {
  const { a } = agente();
  const e = entrada({ shortCover: { path: PORTADA } }, { status: 'published', publishTime: '2026-10-12T09:00:00.000Z' });
  const copias = {
    publica: async (ruta) => { if (ruta === PORTADA) throw new Error('disco lleno'); return { nombre: 'v1.mp4', url: 'https://x/ig-media/v1.mp4' }; },
    borra: async () => true
  };
  let enviado = null;
  const ig = { prepara: async (args) => { enviado = args; return { containerId: 'C1', igUserId: 'IG1' }; } };
  await a.syncSocial(e, { env: { INSTAGRAM_TOKEN: 'I' }, now: new Date('2026-10-11T21:00:00Z'), ig, copias, enlace: { dir, base: 'https://x' } });
  assert.equal(e.metadata.instagram.status, 'uploaded');
  assert.equal(enviado.coverUrl, null);
  assert.equal(e.metadata.instagram.copiaPortada, undefined);
});

test('preparaReelIG manda cover_url solo cuando hay portada', async () => {
  const cuerpos = [];
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('/me?')) return { ok: true, status: 200, json: async () => ({ user_id: 'IG1' }) };
    cuerpos.push(new URLSearchParams(opts.body));
    return { ok: true, status: 200, json: async () => ({ id: 'C1' }) };
  };
  await preparaReelIG({ token: 'T', videoUrl: 'https://x/v.mp4', coverUrl: 'https://x/p.jpg', fetchImpl });
  await preparaReelIG({ token: 'T', videoUrl: 'https://x/v.mp4', fetchImpl });
  assert.equal(cuerpos[0].get('cover_url'), 'https://x/p.jpg');
  assert.equal(cuerpos[0].get('media_type'), 'REELS');
  assert.equal(cuerpos[1].has('cover_url'), false);
});
