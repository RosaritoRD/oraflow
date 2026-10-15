// 05/10/2026: respuesta automática SOLO a los comentarios que son un «Amén».
const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../../utils/amen-automatico');

test('esSoloAmen: Amén y alabanzas cortas sí; peticiones, nombres y preguntas no', () => {
  for (const t of ['Amén', 'amen 🙏', 'AMÉN AMÉN!!!', 'Amennn', 'Amén, gloria a Dios', 'Amén Señor Jesús 🙌', 'Así sea, amén', 'Aleluya amén']) {
    assert.equal(a.esSoloAmen(t), true, t);
  }
  for (const t of ['', '🙏', 'Gloria a Dios', 'Amén por mi hija Ana', 'Amén Carlos', '¿Dónde está el versículo? amén',
    'Amén, oren por mi mamá que está enferma', 'Amén amén amén amén amén amén amén amén amén']) {
    assert.equal(a.esSoloAmen(t), false, t);
  }
});

test('respuestas: varían, hablan de Jesús Rey y solo usan nombres que parecen nombres', () => {
  for (const r of a.RESPUESTAS) assert.match(r, /Jesús/);
  for (const r of a.RESPUESTAS) assert.match(r, /Rey/);
  assert.equal(a.nombreDePila('María López'), 'María');
  assert.equal(a.nombreDePila('@maria123'), '');
  assert.equal(a.nombreDePila('xX_dark_Xx'), '');
  const textos = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => a.respuestaPara({ id, autor: '' })));
  assert.ok(textos.size > 2);
  assert.doesNotMatch(a.respuestaPara({ id: 'x', autor: '@pepe' }), /\{n\}|@pepe/);
});

function dbFalsa(inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
}

test('respondeAmenes: solo Amén recientes, una vez, y si una red falla sigue con las demás', async () => {
  const now = new Date('2026-10-05T15:00:00Z');
  const enviados = [];
  const red = (nombre, lista, falla = false) => ({
    nombre,
    comentarios: async () => { if (falla) throw new Error('sin permiso'); return lista; },
    responde: async ({ id, texto }) => { enviados.push([nombre, id, texto]); }
  });
  const yt = red('youtube', [
    { id: '1', texto: 'Amén 🙏', autor: 'Rosa Pérez', fecha: '2026-10-05T14:00:00Z' },
    { id: '2', texto: 'Amén por mi salud', autor: 'Ana', fecha: '2026-10-05T14:00:00Z' },
    { id: '3', texto: 'amen', autor: 'Luis', fecha: '2026-09-20T14:00:00Z' } // viejo
  ]);
  const db = dbFalsa();
  const r = await a.respondeAmenes({ db, redes: [red('facebook', [], true), yt], now });
  assert.equal(r.respondidos, 1);
  assert.deepEqual(enviados.map(e => e[1]), ['1']);
  assert.match(enviados[0][2], /Rosa/);
  await db.setSetting('amen_proxima', null);
  assert.equal((await a.respondeAmenes({ db, redes: [yt], now })).respondidos, 0); // no repite
  await db.setSetting('amen_proxima', null);
  await db.setSetting('amen_auto_enabled', 'false');
  assert.equal((await a.respondeAmenes({ db, redes: [red('instagram', [{ id: '9', texto: 'Amén', fecha: '2026-10-05T14:00:00Z' }])], now })).respondidos, 0);
});

test('Amén + por quién orar: nombres y familia sí; salud, historias o palabras sueltas no', () => {
  assert.equal(a.porQuienOrar('Amén, María'), 'María');
  assert.equal(a.porQuienOrar('Amén por mi hija Ana y Carlos'), 'tu hija Ana y Carlos');
  assert.equal(a.porQuienOrar('amen por mis hijos'), 'tus hijos');
  assert.equal(a.porQuienOrar('Amén Señor, por mi mamá'), 'tu mamá');
  for (const t of ['Amén Bendiciones', 'Amén por mi salud', 'Amén Carlos, está enfermo', 'María', 'Amén']) assert.equal(a.porQuienOrar(t), null, t);
  assert.match(a.respuestaPara({ id: '1', texto: 'Amén, María' }), /María/);
  assert.match(a.respuestaPara({ id: '1', texto: 'Amén, María' }), /Jesús/);
});

test('ritmo: entre 30 y 90 minutos; antes de tiempo no hace nada', async () => {
  const now = new Date('2026-10-05T15:00:00Z');
  assert.equal(a.proximaVuelta(now, () => 0).getTime() - now.getTime(), 30 * 60000);
  assert.equal(a.proximaVuelta(now, () => 0.9999).getTime() - now.getTime(), 90 * 60000);
  const s = {};
  const db = { getSetting: async k => s[k] ?? null, setSetting: async (k, v) => { s[k] = v; } };
  const red = { nombre: 'youtube', comentarios: async () => [{ id: '1', texto: 'Amén', fecha: '2026-10-05T14:59:00Z' }], responde: async () => {} };
  assert.equal((await a.respondeAmenes({ db, redes: [red], now, azar: () => 0 })).respondidos, 1);
  const red2 = { ...red, comentarios: async () => [{ id: '2', texto: 'Amén', fecha: '2026-10-05T15:05:00Z' }] };
  assert.equal((await a.respondeAmenes({ db, redes: [red2], now: new Date('2026-10-05T15:10:00Z') })).respondidos, 0); // aún no toca
  assert.equal((await a.respondeAmenes({ db, redes: [red2], now: new Date('2026-10-05T15:31:00Z') })).respondidos, 1);
});

test('sin permiso para leer comentarios: la red descansa 6 h en vez de fallar en cada vuelta (07/10/2026)', async () => {
  const db = dbFalsa();
  let lecturas = 0;
  const fb = {
    nombre: 'facebook',
    comentarios: async () => { lecturas += 1; throw new Error("Facebook: (#10) This endpoint requires the 'pages_read_engagement' permission"); },
    responde: async () => {}
  };
  const t0 = new Date('2026-10-07T10:00:00Z');
  await a.respondeAmenes({ db, redes: [fb], now: t0 });
  assert.equal(lecturas, 1);
  assert.match(JSON.parse(db.s.amen_redes).errores.facebook, /pages_read_engagement/); // el panel sigue viendo la causa
  await db.setSetting('amen_proxima', null);
  await a.respondeAmenes({ db, redes: [fb], now: new Date('2026-10-07T12:00:00Z') });
  assert.equal(lecturas, 1); // en pausa
  assert.match(JSON.parse(db.s.amen_redes).errores.facebook, /pages_read_engagement/);
  await db.setSetting('amen_proxima', null);
  await a.respondeAmenes({ db, redes: [fb], now: new Date('2026-10-07T16:30:00Z') });
  assert.equal(lecturas, 2); // pasadas 6 h, vuelve a probar

  // un fallo de red (no de permisos) no pausa
  const db2 = dbFalsa();
  let n = 0;
  const caida = { nombre: 'instagram', comentarios: async () => { n += 1; throw new Error('fetch failed'); }, responde: async () => {} };
  await a.respondeAmenes({ db: db2, redes: [caida], now: t0 });
  await db2.setSetting('amen_proxima', null);
  await a.respondeAmenes({ db: db2, redes: [caida], now: new Date('2026-10-07T11:00:00Z') });
  assert.equal(n, 2);
});

// 12/10/2026: el vídeo de mañana ya está subido (privado, sale a su hora) y YouTube dice que
// tiene los comentarios desactivados. Antes ese error tumbaba la vuelta entera: 8 avisos en
// un día y ningún Amén contestado en YouTube en esas vueltas.
test('youtubeRed: no lee los vídeos que aún no han salido, y un vídeo sin comentarios no tumba a los demás', async () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const pedidos = [];
  const hilo = (id) => ({ id, snippet: { channelId: 'UCnuestro', totalReplyCount: 0,
    topLevelComment: { snippet: { textOriginal: 'Amén', authorDisplayName: 'Ana', authorChannelId: { value: 'UCana' }, publishedAt: '2026-10-12T10:00:00Z' } } } });
  const youtube = { commentThreads: { list: async ({ videoId }) => {
    pedidos.push(videoId);
    if (videoId === 'cerrado') { const e = new Error('The video identified by the videoId parameter has disabled comments.'); e.code = 403; e.errors = [{ reason: 'commentsDisabled' }]; throw e; }
    return { data: { items: [hilo(`c-${videoId}`)] } };
  } } };
  const db = { getRecentPublishedForSocial: async () => [
    { youtubeId: 'ayer', publishTime: '2026-10-11T23:00:00.000Z', title: 'Ayer' },
    { youtubeId: 'cerrado', publishTime: '2026-10-12T09:00:00.000Z', title: 'Sin comentarios' },
    { youtubeId: 'hoy', publishTime: '2026-10-12T11:00:00.000Z', title: 'Hoy' },
    { youtubeId: 'manana', publishTime: '2026-10-13T09:00:00.000Z', title: 'Mañana (aún privado)' }
  ] };
  const lista = await a.youtubeRed({ youtube, db }).comentarios({ now });
  assert.deepEqual(pedidos, ['ayer', 'cerrado', 'hoy'], 'el de mañana ni se pide');
  assert.deepEqual(lista.map(c => c.id), ['c-ayer', 'c-hoy']);
});

test('youtubeRed: la cuota agotada o un permiso caído SÍ cortan la vuelta (los gestiona respondeAmenes)', async () => {
  const now = new Date('2026-10-12T12:00:00Z');
  const youtube = { commentThreads: { list: async () => { const e = new Error('quota'); e.errors = [{ reason: 'quotaExceeded' }]; throw e; } } };
  const db = { getRecentPublishedForSocial: async () => [{ youtubeId: 'ayer', publishTime: '2026-10-11T23:00:00.000Z' }] };
  await assert.rejects(a.youtubeRed({ youtube, db }).comentarios({ now }), /quota/);
});
