// 05/10/2026: comentario del canal en cada publicación nueva de Instagram (el autor lo fija).
const test = require('node:test');
const assert = require('node:assert/strict');
const c = require('../../utils/comentario-ig');

test('texto según la publicación: con fecha, Reel o general; siempre Jesús Rey y Amén, sin 🕊️', () => {
  assert.equal(c.textoPara({ caption: 'Feliz y bendecido lunes 5 de octubre 🙏', media_type: 'IMAGE' }), c.TEXTOS.fecha);
  assert.equal(c.textoPara({ caption: 'x', media_type: 'VIDEO' }), c.TEXTOS.reel);
  assert.equal(c.textoPara({ caption: 'x', media_type: 'CAROUSEL_ALBUM' }), c.TEXTOS.general);
  for (const t of Object.values(c.TEXTOS)) {
    assert.match(t, /Jesús/);
    assert.match(t, /Rey/);
    assert.match(t, /Amén/);
    assert.doesNotMatch(t, /🕊/);
  }
});

test('comentaNuevas: solo lo reciente, una vez, y nunca historias', async () => {
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const now = new Date('2026-10-05T15:00:00Z');
  const medios = [
    { id: '1', caption: 'Feliz y bendecido lunes', media_type: 'IMAGE', timestamp: '2026-10-05T11:00:00Z' },
    { id: '2', caption: 'viejo', media_type: 'IMAGE', timestamp: '2026-10-01T11:00:00Z' },
    { id: '3', caption: '', media_type: 'IMAGE', media_product_type: 'STORY', timestamp: '2026-10-05T12:00:00Z' }
  ];
  const posts = [];
  const fetchImpl = async (url, opts) => {
    if (opts?.method === 'POST') { posts.push(url); return { ok: true, json: async () => ({ id: 'c' }) }; }
    return { ok: true, json: async () => ({ data: medios }) };
  };
  assert.equal(await c.comentaNuevas({ db, token: 't', now, fetchImpl }), 1);
  assert.match(posts[0], /\/1\/comments$/);
  assert.equal(await c.comentaNuevas({ db, token: 't', now, fetchImpl }), 0);
});
