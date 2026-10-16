const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { YouTubeAutomationAgent } = require('../../index');
const core = require('../../utils/outliers-core');
const { OutliersService } = require('../../utils/outliers-service');

const NOW = Date.parse('2026-10-15T00:00:00Z');
const DIA = 86_400_000;
const hace = dias => new Date(NOW - dias * DIA).toISOString();

/* ---------- Pure logic ---------- */

test('median, outlierScore e isoSeconds', () => {
  assert.equal(core.median([3, 1, 2]), 2);
  assert.equal(core.median([4, 1, 3, 2]), 2.5);
  assert.equal(core.median([]), null);
  assert.equal(core.outlierScore(41000, 1000), 41);
  assert.equal(core.outlierScore(500, 0), null);
  assert.equal(core.isoSeconds('PT1M5S'), 65);
  assert.equal(core.isoSeconds('P1DT1S'), 86401);
  assert.equal(core.isoSeconds('raro'), null);
});

test('channelBaseline excludes the video itself and those under 7 days old', () => {
  const uploads = [
    { id: 'objetivo', views: 90000, publishedAt: hace(40) },
    { id: 'a', views: 100, publishedAt: hace(30) },
    { id: 'b', views: 300, publishedAt: hace(20) },
    { id: 'nuevo', views: 5, publishedAt: hace(1) }
  ];
  assert.equal(core.channelBaseline(uploads, 'objetivo', NOW), 200);
  assert.equal(core.channelBaseline(uploads.slice(0, 2), 'objetivo', NOW), null);
});

test('rankOutliers filters by score and views and sorts', () => {
  const rows = [
    { id: 'ruido', score: 212, views: 744 },
    { id: 'real', score: 66, views: 40206 },
    { id: 'flojo', score: 2, views: 90000 },
    { id: 'sin', score: null, views: 90000 },
    { id: 'otro', score: 90, views: 5000 }
  ];
  assert.deepEqual(core.rankOutliers(rows, { minScore: 3, minViews: 1000 }).map(r => r.id), ['otro', 'real']);
});

test('decodeEntities leaves the names readable', () => {
  assert.equal(core.decodeEntities('Kelan &amp; Brittany'), 'Kelan & Brittany');
  assert.equal(core.decodeEntities('It&#39;s &quot;real&quot;'), 'It\'s "real"');
});

test('parseQuery validates and sets defaults', () => {
  assert.deepEqual(core.parseQuery({ q: '  AI receptionist ' }), {
    query: 'AI receptionist', lang: 'en', region: 'US', dias: 180, tipo: 'todos', minScore: 3, minViews: 1000, top: 20
  });
  assert.equal(core.parseQuery({ q: 'ai', lang: 'es', tipo: 'short', dias: '9999', top: '0' }).dias, 730);
  assert.equal(core.parseQuery({ q: 'ai', top: '0' }).top, 1);
  assert.throws(() => core.parseQuery({ q: ' ' }), /tema/);
  assert.throws(() => core.parseQuery({ q: 'ai', lang: 'zz' }), /idioma/);
  assert.throws(() => core.parseQuery({ q: 'ai', tipo: 'reel' }), /tipo/);
  assert.throws(() => core.parseQuery({ q: 'ai', region: 'USA' }), /región/);
});

/* ---------- Service with a simulated YouTube ---------- */

const VIDEOS = {
  v1: { id: 'v1', snippet: { title: 'Real calls &amp; ranking', channelId: 'c1', channelTitle: 'Upfirst', publishedAt: hace(30) }, statistics: { viewCount: '18000' }, contentDetails: { duration: 'PT12M' } },
  v2: { id: 'v2', snippet: { title: 'Short', channelId: 'c2', channelTitle: 'Clara', publishedAt: hace(30) }, statistics: { viewCount: '50' }, contentDetails: { duration: 'PT40S' } },
  u1: { id: 'u1', snippet: { publishedAt: hace(60) }, statistics: { viewCount: '90' }, contentDetails: { duration: 'PT5M' } },
  u2: { id: 'u2', snippet: { publishedAt: hace(50) }, statistics: { viewCount: '100' }, contentDetails: { duration: 'PT5M' } },
  u3: { id: 'u3', snippet: { publishedAt: hace(45) }, statistics: { viewCount: '110' }, contentDetails: { duration: 'PT5M' } }
};

function fakeYouTube({ fail } = {}) {
  const calls = [];
  const fetch = async url => {
    const u = new URL(url);
    const path = u.pathname.split('/').pop();
    calls.push({ path, params: Object.fromEntries(u.searchParams) });
    const ok = body => ({ ok: true, json: async () => body });
    if (fail) return { ok: false, statusText: 'Forbidden', json: async () => ({ error: { message: 'quotaExceeded' } }) };
    if (path === 'search') return ok({ items: [{ id: { videoId: 'v1' } }, { id: { videoId: 'v2' } }] });
    if (path === 'videos') return ok({ items: u.searchParams.get('id').split(',').map(id => VIDEOS[id]).filter(Boolean) });
    if (path === 'channels') return ok({ items: [
      { id: 'c1', statistics: { subscriberCount: '442' }, contentDetails: { relatedPlaylists: { uploads: 'UU1' } } },
      { id: 'c2', statistics: { subscriberCount: '41' }, contentDetails: { relatedPlaylists: { uploads: 'UU2' } } }
    ] });
    if (path === 'playlistItems') {
      const ids = u.searchParams.get('playlistId') === 'UU1' ? ['v1', 'u1', 'u2', 'u3'] : ['v2'];
      return ok({ items: ids.map(videoId => ({ contentDetails: { videoId } })) });
    }
    throw new Error(`ruta inesperada ${path}`);
  };
  return { fetch, calls };
}

test('search scores against the channel\'s median and cleans the names', async () => {
  const yt = fakeYouTube();
  const svc = new OutliersService({ apiKey: 'k', fetch: yt.fetch, now: () => NOW });
  const r = await svc.search({ q: 'ai receptionist' });
  assert.equal(r.results.length, 1);
  const [v] = r.results;
  assert.equal(v.id, 'v1');
  assert.equal(v.title, 'Real calls & ranking');
  assert.equal(v.baseline, 100);
  assert.equal(v.score, 180);
  assert.equal(v.subs, 442);
  assert.equal(v.url, 'https://youtu.be/v1');
  assert.equal(r.scanned, 2);
  assert.ok(r.quota > 100);
  assert.equal(yt.calls.find(c => c.path === 'search').params.key, 'k');
});

test('search with type short requests short videos and drops long ones', async () => {
  const yt = fakeYouTube();
  const svc = new OutliersService({ apiKey: 'k', fetch: yt.fetch, now: () => NOW });
  const r = await svc.search({ q: 'ai', tipo: 'short', minvistas: '0', min: '0' });
  assert.equal(yt.calls.find(c => c.path === 'search').params.videoDuration, 'short');
  assert.equal(r.scanned, 1);
});

test('search caches the same query so it doesn\'t spend quota', async () => {
  const yt = fakeYouTube();
  const svc = new OutliersService({ apiKey: 'k', fetch: yt.fetch, now: () => NOW });
  await svc.search({ q: 'ai receptionist' });
  const antes = yt.calls.length;
  const r = await svc.search({ q: 'AI receptionist ' });
  assert.equal(yt.calls.length, antes);
  assert.equal(r.cached, true);
});

test('without a YouTube key it answers 503 with a clear message', async () => {
  const svc = new OutliersService({ apiKey: '', fetch: async () => { throw new Error('no debe llamar'); } });
  await assert.rejects(svc.search({ q: 'ai' }), e => e.status === 503 && /YOUTUBE_API_KEY/.test(e.message));
});

test('if YouTube fails it returns 502 with its reason and without the key', async () => {
  const svc = new OutliersService({ apiKey: 'secreta', fetch: fakeYouTube({ fail: true }).fetch, now: () => NOW });
  await assert.rejects(svc.search({ q: 'ai' }), e => e.status === 502 && /quotaExceeded/.test(e.message) && !/secreta/.test(e.message));
});

/* ---------- Ruta HTTP ---------- */

async function servidor(t, { apiKey } = {}) {
  const app = express();
  const protect = (req, res, next) => (!apiKey || req.get('x-api-key') === apiKey
    ? next() : res.status(401).json({ success: false, error: 'Unauthorized' }));
  const ctx = { app, outliers: new OutliersService({ apiKey: 'k', fetch: fakeYouTube().fetch, now: () => NOW }) };
  YouTubeAutomationAgent.prototype.setupOutliersAPI.call(ctx, protect);
  const srv = app.listen(0);
  t.after(() => srv.close());
  return `http://127.0.0.1:${srv.address().port}`;
}

test('GET /api/outliers devuelve resultados', async t => {
  const base = await servidor(t);
  const r = await (await fetch(`${base}/api/outliers?q=ai%20receptionist`)).json();
  assert.equal(r.success, true);
  assert.equal(r.result.results[0].id, 'v1');
});

test('GET /api/outliers without a topic gives 400', async t => {
  const base = await servidor(t);
  const res = await fetch(`${base}/api/outliers?q=`);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /tema/);
});

test('GET /api/outliers spends quota: it requires the panel key', async t => {
  const base = await servidor(t, { apiKey: 'panel' });
  assert.equal((await fetch(`${base}/api/outliers?q=ai`)).status, 401);
  assert.equal((await fetch(`${base}/api/outliers?q=ai`, { headers: { 'x-api-key': 'panel' } })).status, 200);
});
