// 04/10/2026: every Short published on YouTube is also uploaded as a Reel to the
// Facebook Page. Facebook only accepts Reels of 3 to 90 s and the Shorts come
// out at 92-99 s, so the Facebook copy is sped up slightly.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const {
  facebookConfig, planDeVelocidad, modoDePublicacion, publicaReel
} = require('../../utils/facebook-reels');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');

test('without a page or token, Facebook stays off', () => {
  assert.equal(facebookConfig({}), null);
  assert.equal(facebookConfig({ FACEBOOK_PAGE_ID: '123' }), null);
  assert.deepEqual(
    facebookConfig({ FACEBOOK_PAGE_ID: ' 123 ', FACEBOOK_PAGE_TOKEN: ' tok ' }),
    { pageId: '123', token: 'tok', version: 'v25.0' }
  );
  assert.equal(facebookConfig({ FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_TOKEN: 't', FACEBOOK_REELS: 'off' }), null);
});

test('up to 89.5 s it\'s untouched; 92-99 s gets sped up; longer is rejected', () => {
  assert.equal(planDeVelocidad(60).speed, 1);
  assert.equal(planDeVelocidad(89.5).speed, 1);
  const p = planDeVelocidad(98.745);
  assert.ok(p.speed > 1.1 && p.speed <= 1.12);
  assert.ok(98.745 / p.speed <= 89.5);
  assert.throws(() => planDeVelocidad(110), /90/);
  assert.throws(() => planDeVelocidad(2), /3/);
});

test('scheduled at the same time as YouTube if more than 10 min remain', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  assert.deepEqual(modoDePublicacion('2026-10-04T23:00:00Z', now), {
    video_state: 'SCHEDULED',
    scheduled_publish_time: String(Date.parse('2026-10-04T23:00:00Z') / 1000)
  });
  assert.deepEqual(modoDePublicacion('2026-10-04T12:05:00Z', now), { video_state: 'PUBLISHED' });
  assert.deepEqual(modoDePublicacion(null, now), { video_state: 'PUBLISHED' });
});

function fakeFetch(calls, { failFinish = false } = {}) {
  return async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const u = String(url);
    let body = { success: true };
    if (u.includes('upload_phase=start')) body = { video_id: 'vid9', upload_url: 'https://rupload.facebook.com/video-upload/v25.0/vid9' };
    if (u.includes('upload_phase=finish')) body = failFinish ? { error: { message: 'Bad reel' } } : { success: true };
    return { ok: !(failFinish && u.includes('finish')), status: 200, json: async () => body };
  };
}

test('publicaReel follows Meta\'s 3 steps with the page token', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbreel-'));
  const video = path.join(dir, 'v.mp4');
  fs.writeFileSync(video, Buffer.alloc(1234));
  const calls = [];
  const r = await publicaReel({
    config: { pageId: 'P1', token: 'TOK', version: 'v25.0' },
    videoPath: video,
    description: 'Hola',
    publishAt: '2026-10-04T23:00:00Z',
    now: new Date('2026-10-04T12:00:00Z'),
    fetchImpl: fakeFetch(calls),
    duracionDe: async () => 60
  });
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /graph\.facebook\.com\/v25\.0\/P1\/video_reels/);
  assert.equal(calls[1].url, 'https://rupload.facebook.com/video-upload/v25.0/vid9');
  assert.equal(calls[1].opts.headers.Authorization, 'OAuth TOK');
  assert.equal(calls[1].opts.headers.file_size, '1234');
  assert.match(calls[2].url, /video_state=SCHEDULED/);
  assert.match(calls[2].url, /description=Hola/);
  assert.deepEqual(r, { videoId: 'vid9', state: 'SCHEDULED', speed: 1 });
});

test('if Meta rejects the Reel, the error carries its message', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbreel-'));
  const video = path.join(dir, 'v.mp4');
  fs.writeFileSync(video, Buffer.alloc(10));
  await assert.rejects(publicaReel({
    config: { pageId: 'P1', token: 'TOK', version: 'v25.0' },
    videoPath: video, description: '', fetchImpl: fakeFetch([], { failFinish: true }), duracionDe: async () => 60
  }), /Bad reel/);
});

function agenteFalso() {
  const updates = [];
  const agent = new PublishingSchedulingAgent({ updateScheduleEntry: async e => updates.push(JSON.parse(JSON.stringify(e))), getSetting: async () => null }, {});
  agent.logger = { info() {}, warn() {}, error() {}, success() {} };
  return { agent, updates };
}

test('the Short goes to Facebook as a Reel and the result is stored on the job', async () => {
  const { agent, updates } = agenteFalso();
  const env = { FACEBOOK_PAGE_ID: 'P1', FACEBOOK_PAGE_TOKEN: 'T' };
  const otro = { id: 's1', status: 'published', metadata: { contentFormat: 'podcast', video: { path: '/x.mp4' } } };
  assert.equal(await agent.syncSocial(otro, { env, publicarFacebook: async () => assert.fail('no') }), null);

  const corto = { id: 's2', status: 'published', publicAt: '2026-10-04T23:00:00Z', metadata: { contentFormat: 'short', video: { path: '/x.mp4' }, seo: { title: 'T' } } };
  const { facebook: fb } = await agent.syncSocial(corto, { env, publicarFacebook: async () => ({ videoId: 'r1', state: 'SCHEDULED', speed: 1.1 }) });
  assert.equal(fb.status, 'scheduled');
  assert.equal(fb.reelId, 'r1');
  assert.equal(updates.at(-1).metadata.facebook.reelId, 'r1');

  // Already uploaded: not repeated.
  assert.equal((await agent.syncSocial(corto, { env, publicarFacebook: async () => assert.fail('repetido') })).facebook.reelId, 'r1');
});

test('a Facebook failure doesn\'t take down the YouTube publication', async () => {
  const { agent, updates } = agenteFalso();
  const corto = { id: 's3', status: 'published', metadata: { contentFormat: 'short', video: { path: '/x.mp4' } } };
  const { facebook: fb } = await agent.syncSocial(corto, {
    env: { FACEBOOK_PAGE_ID: 'P1', FACEBOOK_PAGE_TOKEN: 'T' },
    publicarFacebook: async () => { throw new Error('token caducado'); }
  });
  assert.equal(fb.status, 'failed');
  assert.match(fb.error, /token caducado/);
  assert.equal(updates.at(-1).status, 'published');
});

test('the long video goes to the Page as a video, with a thumbnail, and not to Instagram', async () => {
  const { agent } = agenteFalso();
  const largo = {
    id: 'l1', status: 'published', publishTime: '2026-10-05T08:00:00.000Z',
    metadata: { contentFormat: 'long', video: { path: '/largo.mp4' }, thumbnail: { path: '/mini.jpg' },
      seo: { title: 'ORACIÓN DE LA MAÑANA', description: 'Entrega tus preocupaciones.\n\n00:00 Inicio\n🔔 Suscríbete' } }
  };
  const { facebook } = await agent.syncSocial(largo, {
    env: { FACEBOOK_PAGE_ID: 'P1', FACEBOOK_PAGE_TOKEN: 'T', INSTAGRAM_TOKEN: 'I' },
    publicarFacebook: async () => assert.fail('no es Reel'),
    publicarFacebookLargo: async ({ title, description, thumbPath, publishAt }) => {
      assert.equal(title, 'ORACIÓN DE LA MAÑANA');
      assert.equal(thumbPath, '/mini.jpg');
      assert.equal(publishAt, '2026-10-05T08:00:00.000Z');
      assert.doesNotMatch(description, /00:00|🔔|ORACIÓN DE LA MAÑANA/);
      assert.match(description, /Sigue la página/);
      return { videoId: 'V1', state: 'SCHEDULED' };
    },
    ig: { prepara: async () => assert.fail('el largo no va a Instagram') }
  });
  assert.equal(facebook.kind, 'video');
  assert.equal(facebook.url, 'https://www.facebook.com/watch/?v=V1');
  assert.equal(largo.metadata.instagram, undefined);
});

test('publicaVideoLargo uploads in chunks, schedules with published=false and sets the thumbnail', async () => {
  const { publicaVideoLargo } = require('../../utils/facebook-reels');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fblargo-'));
  const video = path.join(dir, 'v.mp4');
  const mini = path.join(dir, 'm.jpg');
  fs.writeFileSync(video, Buffer.alloc(50));
  fs.writeFileSync(mini, Buffer.alloc(5));
  const fases = [];
  let fin;
  let miniatura;
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  const r = await publicaVideoLargo({
    config: { pageId: 'P1', token: 'TOK', version: 'v25.0' },
    videoPath: video, thumbPath: mini, title: 'T', description: 'D',
    publishAt: '2026-10-05T08:00:00Z', now: new Date('2026-10-04T20:00:00Z'),
    fetchImpl: async (url, opts) => {
      if (String(url).endsWith('/V9/thumbnails')) { miniatura = opts.body; return ok({ success: true }); }
      assert.equal(url, 'https://graph-video.facebook.com/v25.0/P1/videos');
      const f = opts.body;
      fases.push(f.get('upload_phase'));
      if (f.get('upload_phase') === 'start') { assert.equal(f.get('file_size'), '50'); return ok({ video_id: 'V9', upload_session_id: 'S', start_offset: '0', end_offset: '30' }); }
      if (f.get('upload_phase') === 'transfer') {
        const desde = Number(f.get('start_offset'));
        assert.equal(f.get('video_file_chunk').size, desde === 0 ? 30 : 20);
        return ok(desde === 0 ? { start_offset: '30', end_offset: '50' } : { start_offset: '50', end_offset: '50' });
      }
      fin = f;
      return ok({ success: true });
    }
  });
  assert.deepEqual(r, { videoId: 'V9', state: 'SCHEDULED' });
  assert.deepEqual(fases, ['start', 'transfer', 'transfer', 'finish']);
  assert.equal(fin.get('published'), 'false');
  assert.equal(fin.get('scheduled_publish_time'), String(Date.parse('2026-10-05T08:00:00Z') / 1000));
  assert.equal(fin.get('title'), 'T');
  assert.equal(miniatura.get('is_preferred'), 'true');
  assert.equal(miniatura.get('source').size, 5);
});
