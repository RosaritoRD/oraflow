// 04/10/2026: Shorts also go out as a Reel on Instagram and Facebook, with a text of
// their own for each network (not the YouTube one).
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { textoParaRed } = require('../../utils/texto-social');
const {
  preparaReelIG, estadoIG, publicaIG, tokenInstagram, renuevaTokenSiToca
} = require('../../utils/instagram-reels');
const { PublishingSchedulingAgent } = require('../../agents/publishing-scheduling-agent');

const SEO = {
  title: 'Oración de la mañana para pedir protección 🙏',
  description: [
    'Una oración breve para agradecer a Dios y pedir su dirección.',
    'Comienza el día con fe, esperanza y calma ante tus preocupaciones.',
    '#shorts #oraciondelamanana #proteccion',
    '🙏 Escribe en los comentarios el nombre de alguien por quien quieres orar hoy.\n🔔 Oraciones en Presencia de Yeshua: una oración nueva cada mañana y cada noche.'
  ].join('\n\n'),
  hashtags: ['#shorts', '#oraciondelamanana', '#proteccion']
};

test('the text drops the YouTube parts and keeps title, prayer and the invitation to comment', () => {
  const t = textoParaRed(SEO, 'instagram');
  assert.match(t, /^Oración de la mañana para pedir protección 🙏\n\nUna oración breve/);
  assert.match(t, /Comienza el día con fe/);
  assert.match(t, /Escribe en los comentarios el nombre/);
  assert.doesNotMatch(t, /#shorts/i);
  assert.doesNotMatch(t, /🔔/);
  assert.match(t, /Envía esta oración/);
});

test('hashtags: the video\'s + the brand\'s, no repeats, more on Instagram than on Facebook', () => {
  const ig = textoParaRed(SEO, 'instagram').split('\n').at(-1).split(' ');
  const fb = textoParaRed(SEO, 'facebook').split('\n').at(-1).split(' ');
  assert.ok(ig.includes('#oraciondelamanana') && ig.includes('#proteccion') && ig.includes('#oracion'));
  assert.equal(new Set(ig.map(h => h.toLowerCase())).size, ig.length);
  assert.equal(ig.length, 5); // tope de Instagram desde dic. 2025
  assert.equal(fb.length, 3);
  assert.ok(fb.includes('#oracion')); // siempre entra uno de marca
  assert.ok(ig.every(h => /^#\S+$/.test(h)));
});

test('Facebook invites following the page; the text respects Instagram\'s cap', () => {
  assert.match(textoParaRed(SEO, 'facebook'), /Sigue la página/);
  const largo = textoParaRed({ title: 'T', description: 'x'.repeat(5000) }, 'instagram');
  assert.ok(largo.length <= 2200);
  assert.match(largo, /#oracion/); // hashtags aren't lost when trimming
});

function respuesta(body, ok = true) { return { ok, status: ok ? 200 : 400, json: async () => body }; }

test('Instagram: creates the REELS container from the public link', async () => {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/me?')) return respuesta({ user_id: 'IG1', username: 'oracionesjeshua' });
    return respuesta({ id: 'C1' });
  };
  const r = await preparaReelIG({ token: 'TK', videoUrl: 'https://panel.your-domain.com/ig-media/abc.mp4', caption: 'Hola 🙏', fetchImpl });
  assert.deepEqual(r, { containerId: 'C1', igUserId: 'IG1' });
  assert.match(calls[1].url, /\/IG1\/media$/);
  const form = new URLSearchParams(calls[1].opts.body);
  assert.equal(form.get('media_type'), 'REELS');
  assert.equal(form.get('video_url'), 'https://panel.your-domain.com/ig-media/abc.mp4');
  assert.equal(form.get('share_to_feed'), 'true');
  assert.equal(form.get('caption'), 'Hola 🙏');
  assert.equal(form.get('upload_type'), null);
});

test('Instagram: container status and publishing with a link', async () => {
  const fetchImpl = async url => {
    const u = String(url);
    if (u.includes('fields=status_code')) return respuesta({ status_code: 'FINISHED' });
    if (u.endsWith('/media_publish')) return respuesta({ id: 'M9' });
    if (u.includes('fields=permalink')) return respuesta({ permalink: 'https://www.instagram.com/reel/abc/' });
    return respuesta({ error: { message: 'inesperado' } }, false);
  };
  assert.equal((await estadoIG({ token: 'T', containerId: 'C1', fetchImpl })).status, 'FINISHED');
  assert.deepEqual(await publicaIG({ token: 'T', igUserId: 'IG1', containerId: 'C1', fetchImpl }),
    { mediaId: 'M9', permalink: 'https://www.instagram.com/reel/abc/' });
});

function dbFalsa(inicial = {}) {
  const settings = { ...inicial };
  return {
    settings,
    getSetting: async k => (k in settings ? settings[k] : null),
    setSetting: async (k, v) => { settings[k] = v; }
  };
}

test('token: the renewed one rules, unless another is set by hand in .env', async () => {
  const env = { INSTAGRAM_TOKEN: 'ENV1' };
  const db = dbFalsa();
  assert.equal(await tokenInstagram(db, env), 'ENV1');
  const now = new Date('2026-10-04T12:00:00Z');
  // First time: it only notes the date (Meta doesn't renew tokens younger than 24 h).
  assert.equal(await renuevaTokenSiToca({ db, env, now, fetchImpl: async () => assert.fail('pronto') }), false);
  const later = new Date('2026-10-12T12:00:00Z');
  const ok = await renuevaTokenSiToca({
    db, env, now: later,
    fetchImpl: async url => { assert.match(String(url), /grant_type=ig_refresh_token/); return respuesta({ access_token: 'NEW', expires_in: 5184000 }); }
  });
  assert.equal(ok, true);
  assert.equal(await tokenInstagram(db, env), 'NEW');
  assert.equal(await tokenInstagram(db, { INSTAGRAM_TOKEN: 'ENV2' }), 'ENV2');
});

function agente(entries = []) {
  const updates = [];
  const db = {
    ...dbFalsa(),
    updateScheduleEntry: async e => updates.push(JSON.parse(JSON.stringify(e))),
    getRecentPublishedForSocial: async () => entries
  };
  const agent = new PublishingSchedulingAgent(db, {});
  agent.logger = { info() {}, warn() {}, error() {}, success() {} };
  return { agent, updates };
}

const short = (extra = {}) => ({
  id: 's1', status: 'published', publishTime: '2026-10-05T09:00:00.000Z',
  metadata: { contentFormat: 'short', video: { path: '/x.mp4' }, seo: SEO, ...extra }
});

test('after YouTube: Facebook gets scheduled and Instagram stays uploaded waiting for its time', async () => {
  const { agent, updates } = agente();
  const entry = short();
  const env = { FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F', INSTAGRAM_TOKEN: 'I' };
  const ig = {
    prepara: async ({ caption, videoUrl }) => { assert.doesNotMatch(caption, /#shorts/); assert.equal(videoUrl, 'https://x/ig-media/n1.mp4'); return { containerId: 'C1', igUserId: 'IG1' }; },
    estado: async () => assert.fail('aún no es la hora'),
    publica: async () => assert.fail('aún no es la hora')
  };
  const copias = { publica: async () => ({ nombre: 'n1', url: 'https://x/ig-media/n1.mp4' }), borra: async () => true };
  await agent.syncSocial(entry, {
    env, now: new Date('2026-10-04T21:00:00Z'), ig, copias, enlace: { dir: '/tmp', base: 'https://x' },
    publicarFacebook: async ({ description }) => { assert.match(description, /Sigue la página/); return { videoId: 'R1', state: 'SCHEDULED', speed: 1.1 }; }
  });
  const m = updates.at(-1).metadata;
  assert.equal(m.facebook.status, 'scheduled');
  assert.equal(m.instagram.status, 'uploaded');
  assert.equal(m.instagram.containerId, 'C1');
  assert.equal(m.instagram.publishAt, '2026-10-05T09:00:00.000Z');
  assert.equal(m.instagram.copia, 'n1');
});

test('at its time, Instagram publishes; if still processing, it waits for the next round', async () => {
  const { agent } = agente();
  const entry = short({ facebook: { status: 'scheduled', reelId: 'R1' }, instagram: { status: 'uploaded', containerId: 'C1', igUserId: 'IG1', copia: 'n1', publishAt: '2026-10-05T09:00:00.000Z' } });
  const env = { INSTAGRAM_TOKEN: 'I' };
  const borradas = [];
  const extra = { enlace: { dir: '/tmp', base: 'https://x' }, copias: { borra: async n => borradas.push(n) } };
  let estado = 'IN_PROGRESS';
  const ig = {
    prepara: async () => assert.fail('ya subido'),
    estado: async () => ({ status: estado }),
    publica: async () => ({ mediaId: 'M1', permalink: 'https://www.instagram.com/reel/x/' })
  };
  await agent.syncSocial(entry, { env, now: new Date('2026-10-05T09:00:30Z'), ig, ...extra });
  assert.equal(entry.metadata.instagram.status, 'uploaded');
  assert.deepEqual(borradas, []); // still processing: the copy remains
  estado = 'FINISHED';
  await agent.syncSocial(entry, { env, now: new Date('2026-10-05T09:15:00Z'), ig, ...extra });
  assert.deepEqual(borradas, ['n1']);
  assert.equal(entry.metadata.instagram.status, 'published');
  assert.equal(entry.metadata.instagram.url, 'https://www.instagram.com/reel/x/');
});

test('retries up to 3 times; a permanent failure isn\'t repeated', async () => {
  const { agent } = agente();
  const env = { FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F' };
  const entry = short();
  let intentos = 0;
  const publicarFacebook = async () => { intentos += 1; throw new Error('red caída'); };
  for (let i = 0; i < 5; i += 1) await agent.syncSocial(entry, { env, publicarFacebook });
  assert.equal(intentos, 3);
  assert.equal(entry.metadata.facebook.status, 'failed');

  const largo = short();
  let otra = 0;
  const demasiado = async () => { otra += 1; const e = new Error('dura 120s'); e.permanent = true; throw e; };
  await agent.syncSocial(largo, { env, publicarFacebook: demasiado });
  await agent.syncSocial(largo, { env, publicarFacebook: demasiado });
  assert.equal(otra, 1);
});

test('the queue round goes over the recent Shorts', async () => {
  const entry = short({ instagram: { status: 'uploaded', containerId: 'C1', igUserId: 'IG1', publishAt: '2026-10-05T09:00:00.000Z' } });
  const { agent } = agente([entry]);
  agent.socialDeps = {
    env: { INSTAGRAM_TOKEN: 'I' },
    enlace: { dir: fs.mkdtempSync(path.join(os.tmpdir(), 'igm-')), base: 'https://x' },
    copias: { borra: async () => true },
    ig: { estado: async () => ({ status: 'FINISHED' }), publica: async () => ({ mediaId: 'M', permalink: 'p' }) },
    now: new Date('2026-10-05T09:01:00Z')
  };
  await agent.syncRecentSocial();
  assert.equal(entry.metadata.instagram.status, 'published');
});

test('what was already public before connecting the networks isn\'t dumped all at once', async () => {
  const viejo = short();
  viejo.publishTime = '2026-10-04T09:00:00.000Z';
  const futuro = short();
  futuro.id = 's2';
  futuro.publishTime = '2026-10-04T23:00:00.000Z';
  const { agent } = agente([viejo, futuro]);
  const tocados = [];
  agent.socialDeps = {
    env: { FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F' },
    now: new Date('2026-10-04T17:00:00Z'),
    publicarFacebook: async () => { return { videoId: 'R', state: 'SCHEDULED', speed: 1 }; }
  };
  agent.syncSocial = async e => { tocados.push(e.id); };
  await agent.syncRecentSocial();
  assert.deepEqual(tocados, ['s2']);
});

test('without a configured public link, Instagram isn\'t tried', async () => {
  const { agent } = agente();
  const entry = short();
  await agent.syncSocial(entry, { env: { INSTAGRAM_TOKEN: 'I' }, ig: { prepara: async () => assert.fail('sin enlace') } });
  assert.equal(entry.metadata.instagram, undefined);
});

test('public copies: 48-hex name, deleted and expiring at 26 h', async () => {
  const { enlacePublicoConfig, publicaCopia, borraCopia, limpiaCopiasViejas } = require('../../utils/enlace-publico');
  assert.equal(enlacePublicoConfig({ IG_MEDIA_DIR: '/x', IG_MEDIA_BASE_URL: 'http://inseguro' }), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igm-'));
  const cfg = enlacePublicoConfig({ IG_MEDIA_DIR: dir, IG_MEDIA_BASE_URL: 'https://panel.your-domain.com/ig-media/' });
  const src = path.join(dir, '..', `src-${process.pid}.mp4`);
  fs.writeFileSync(src, 'v');
  const c = await publicaCopia(src, cfg);
  assert.match(c.nombre, /^[a-f0-9]{48}\.mp4$/);
  assert.equal(c.url, `https://panel.your-domain.com/ig-media/${c.nombre}`);
  assert.equal(await borraCopia('../../etc/passwd', cfg), false);
  const vieja = await publicaCopia(src, cfg);
  const hace = (Date.now() - 27 * 3600000) / 1000;
  fs.utimesSync(path.join(dir, vieja.nombre), hace, hace);
  assert.equal(await limpiaCopiasViejas(cfg), 1);
  assert.ok(fs.existsSync(path.join(dir, c.nombre)));
  await borraCopia(c.nombre, cfg);
  assert.ok(!fs.existsSync(path.join(dir, c.nombre)));
});

test('the YouTube footer (from the ━━━ rule) doesn\'t go to Instagram or Facebook', () => {
  const { textoParaRed } = require('../../utils/texto-social');
  const t = textoParaRed({ title: 'T', description: 'Cuerpo de la oración.\n\n━━━━━━━━━━\n► Instagram: https://www.instagram.com/your_account\n🎁 Código YOUR_COUPON' }, 'instagram', {});
  assert.match(t, /Cuerpo de la oración/);
  assert.doesNotMatch(t, /━|instagram\.com|YOUR_COUPON/);
});

test('Short too long for a Reel: goes out as a normal Page video (07/10/2026)', async () => {
  const { agent } = agente();
  const env = { FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F' };
  const entry = short();
  const largo = [];
  await agent.syncSocial(entry, {
    env, now: new Date('2026-10-04T21:00:00Z'),
    publicarFacebook: async () => { const e = new Error('El Short dura 126.4s'); e.permanent = true; e.code = 'reel_demasiado_largo'; throw e; },
    publicarFacebookLargo: async (args) => { largo.push(args); return { videoId: 'V9', state: 'SCHEDULED' }; }
  });
  assert.equal(largo.length, 1);
  assert.equal(largo[0].videoPath, '/x.mp4');
  assert.equal(entry.metadata.facebook.status, 'scheduled');
  assert.equal(entry.metadata.facebook.kind, 'video');
  assert.equal(entry.metadata.facebook.url, 'https://www.facebook.com/watch/?v=V9');
});

// 07/10/2026: Instagram pushes to YouTube and the book; Facebook, to the book.
test('Instagram invites to the full prayer on YouTube and to the book; Facebook to the book', () => {
  const ig = textoParaRed(SEO, 'instagram', {});
  assert.match(ig, /▶️ .*YouTube.*enlace del perfil/);
  assert.match(ig, /30 días de paz/);
  assert.match(textoParaRed(SEO, 'facebook', {}), /30 días de paz/);
});
