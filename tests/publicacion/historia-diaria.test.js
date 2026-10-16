// 05/10/2026: an Instagram and Facebook story announcing the long YouTube video.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const h = require('../../utils/historia-diaria');

test('short date and readable title for the story', () => {
  assert.equal(h.fechaCorta(new Date('2026-10-05T12:00:00Z'), 'America/New_York'), '5 de octubre');
  assert.equal(h.tituloHistoria('ORACIÓN DE LA MAÑANA | DIOS CUIDA DE TI: ENTREGA TUS PREOCUPACIONES | Isaías 26:3'),
    'Oración de la mañana · Dios cuida de ti: Entrega tus preocupaciones');
  assert.equal(h.tituloHistoria('Si tu mente no descansa, haz esta oración 🙏'), 'Si tu mente no descansa, haz esta oración');
});

test('html: date, escaped title, button and brand', () => {
  const html = h.htmlHistoria({ miniatura: '/x/m.jpg', fecha: '5 de octubre', titulo: 'Paz <b>' });
  assert.match(html, /Oración de hoy/);
  assert.match(html, /5 de octubre/);
  assert.match(html, /Paz &lt;b&gt;/);
  assert.match(html, /VER ORACIÓN COMPLETA/);
  assert.match(html, /@your_account/);
});

function dbFalsa(entradas, inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; }, getRecentPublishedForSocial: async () => entradas };
}

const largo = (id, hora) => ({ youtubeId: id, youtubeUrl: `https://youtu.be/${id}`, publishTime: hora, title: 'Oración',
  metadata: { contentFormat: 'long', thumbnail: { path: '/m.jpg' }, seo: { title: 'Oración de la mañana' } } });

test('publicaHistorias: once per public long video, IG and FB separately, no Shorts or future ones', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'historia-'));
  const entradas = [
    largo('A', '2026-10-05T08:00:00Z'),
    largo('FUTURO', '2026-10-05T22:30:00Z'),
    { ...largo('S', '2026-10-05T09:00:00Z'), metadata: { contentFormat: 'short', thumbnail: { path: '/m.jpg' } } }
  ];
  const db = dbFalsa(entradas, { historia_ig_auto: 'true' });
  const llamadas = [];
  let fbFalla = true;
  const deps = {
    enlace: { dir: dataDir, base: 'https://x.test' }, existe: () => true, tokenInstagram: async () => 'tok',
    renderizaHistoria: async (_d, salida) => salida,
    publicaCopia: async () => ({ nombre: 'a.jpg', url: 'https://x.test/a.jpg' }), borraCopia: async () => true,
    preparaHistoriaIG: async () => { llamadas.push('ig'); return { containerId: 'c', igUserId: 'u' }; },
    estadoIG: async () => ({ status: 'FINISHED' }), publicaIG: async () => ({ mediaId: 'm' }),
    publicaHistoriaFB: async () => { llamadas.push('fb'); if (fbFalla) throw new Error('caído'); return { postId: 'p' }; },
    preparaPanel: async () => { llamadas.push('panel'); },
    espera: async () => {}
  };
  const env = { FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_TOKEN: 't' };
  const now = new Date('2026-10-05T12:00:00Z');
  const r1 = await h.publicaHistorias({ db, env, now, dataDir, deps });
  assert.deepEqual(r1.map(r => r.youtubeId), ['A']);
  assert.equal(r1[0].instagram.status, 'published');
  assert.equal(r1[0].facebook.status, 'failed');
  fbFalla = false;
  await h.publicaHistorias({ db, env, now, dataDir, deps });
  assert.deepEqual(llamadas, ['ig', 'fb', 'panel', 'fb']); // the retry doesn't repeat Instagram or the panel
  assert.deepEqual(await h.publicaHistorias({ db, env, now, dataDir, deps }), []);
  assert.equal(JSON.parse(db.s.historia_hechas).A.facebook.status, 'published');
});

test('by default Instagram is NOT published automatically (the owner uploads it with the link): Facebook + panel', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'historia-'));
  const db = dbFalsa([largo('B', '2026-10-05T08:00:00Z')]);
  const llamadas = [];
  const deps = {
    enlace: { dir: dataDir, base: 'https://x.test' }, existe: () => true, tokenInstagram: async () => 'tok',
    renderizaHistoria: async (_d, salida) => salida, publicaCopia: async () => ({ nombre: 'a.jpg', url: 'u' }), borraCopia: async () => true,
    preparaHistoriaIG: async () => { llamadas.push('ig'); return {}; }, publicaHistoriaFB: async () => { llamadas.push('fb'); return { postId: 'p' }; },
    preparaPanel: async () => { llamadas.push('panel'); }
  };
  const r = await h.publicaHistorias({ db, env: { FACEBOOK_PAGE_ID: '1', FACEBOOK_PAGE_TOKEN: 't' }, now: new Date('2026-10-05T12:00:00Z'), dataDir, deps });
  assert.deepEqual(llamadas, ['fb', 'panel']);
  assert.equal(r[0].panel.status, 'listo');
});

test('panel: leaves the clean image (no video) and the fixed link', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-'));
  const jpg = path.join(dir, 'origen.jpg');
  fs.writeFileSync(jpg, 'x');
  fs.writeFileSync(path.join(dir, 'hoy.mp4'), 'viejo');
  await h.preparaPanel({ jpg, video: { youtubeId: 'A', youtubeUrl: 'u', title: 'T' }, dir });
  assert.ok(fs.existsSync(path.join(dir, 'hoy.jpg')));
  assert.ok(!fs.existsSync(path.join(dir, 'hoy.mp4')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'hoy.json'))).enlace, h.ENLACE_HOY);
});
