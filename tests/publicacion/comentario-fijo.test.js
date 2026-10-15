const test = require('node:test');
const assert = require('node:assert/strict');
const { textoComentario, tipoDeVideo, comentaPublicados } = require('../../utils/comentario-fijo');

// 30/09: cada vídeo público lleva un comentario del canal invitando a
// suscribirse. Se pone cuando el vídeo YA es público (en privado YouTube no deja).

test('distingue Short, mañana y noche', () => {
  assert.deepEqual(tipoDeVideo({ snippet: { title: 'Oración corta #shorts' }, contentDetails: { duration: 'PT45S' } }), { formato: 'short', franja: 'mañana' });
  assert.equal(tipoDeVideo({ snippet: { title: 'Oración de la noche para dormir en paz' }, contentDetails: { duration: 'PT58S' } }).formato, 'short');
  assert.deepEqual(tipoDeVideo({ snippet: { title: 'ORACIÓN DE LA NOCHE — MARTES' }, contentDetails: { duration: 'PT17M30S' } }), { formato: 'long', franja: 'noche' });
  assert.deepEqual(tipoDeVideo({ snippet: { title: 'ORACIÓN DE LA MAÑANA — JUEVES' }, contentDetails: { duration: 'PT7M2S' } }), { formato: 'long', franja: 'mañana' });
});

test('el texto invita a suscribirse, encaja con el vídeo y es estable por vídeo', () => {
  const noche = textoComentario({ videoId: 'abc', formato: 'long', franja: 'noche' });
  assert.match(noche, /suscr[ií]b/i);
  assert.match(noche, /noche/i);
  assert.equal(textoComentario({ videoId: 'abc', formato: 'long', franja: 'noche' }), noche);
  assert.match(textoComentario({ videoId: 'abc', formato: 'short', franja: 'mañana' }), /suscr[ií]b/i);
  const variados = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(videoId => textoComentario({ videoId, formato: 'long', franja: 'mañana' })));
  assert.ok(variados.size > 1);                                           // no el mismo texto en todos
});

function fakeYouTube(videos) {
  const puestos = [];
  return {
    puestos,
    channels: { list: async () => ({ data: { items: [{ contentDetails: { relatedPlaylists: { uploads: 'UU1' } } }] } }) },
    playlistItems: { list: async () => ({ data: { items: videos.map(v => ({ contentDetails: { videoId: v.id } })) } }) },
    videos: { list: async ({ id }) => ({ data: { items: videos.filter(v => id.split(',').includes(v.id)) } }) },
    commentThreads: {
      insert: async ({ requestBody }) => {
        const v = videos.find(x => x.id === requestBody.snippet.videoId);
        if (v.cerrado) { const e = new Error('comments disabled'); e.code = 403; throw e; }
        puestos.push(requestBody.snippet.videoId);
        return { data: { id: `c_${v.id}` } };
      }
    }
  };
}

function fakeDb() {
  const s = new Map();
  return { getSetting: async k => s.get(k) ?? null, setSetting: async (k, v) => s.set(k, v), s };
}

const video = (id, privacy, extra = {}) => ({ id, status: { privacyStatus: privacy }, snippet: { title: 'ORACIÓN DE LA MAÑANA' }, contentDetails: { duration: 'PT7M' }, ...extra });

test('comenta solo los públicos, una sola vez, y recuerda los que no se pueden', async () => {
  const yt = fakeYouTube([video('pub1', 'public'), video('priv', 'private'), video('pub2', 'public'), video('cerr', 'public', { cerrado: true })]);
  const db = fakeDb();
  const logger = { info() {}, warn() {} };
  const r1 = await comentaPublicados({ youtube: yt, db, logger });
  assert.deepEqual(yt.puestos, ['pub1', 'pub2']);
  assert.equal(r1.nuevos, 2);
  await comentaPublicados({ youtube: yt, db, logger });                   // segunda vuelta: nada repetido
  assert.deepEqual(yt.puestos, ['pub1', 'pub2']);
  const estado = JSON.parse(db.s.get('comentarios_canal'));
  assert.equal(estado.pub1.commentId, 'c_pub1');
  assert.ok(estado.cerr.error);
});

test('un vídeo con comentarios cerrados se deja tras 3 intentos', async () => {
  const yt = fakeYouTube([video('cerr', 'public', { cerrado: true })]);
  const db = fakeDb();
  for (let i = 0; i < 5; i++) await comentaPublicados({ youtube: yt, db, logger: { info() {}, warn() {} } });
  assert.equal(JSON.parse(db.s.get('comentarios_canal')).cerr.intentos, 3);
});

test('ningún texto pide peticiones de oración ni promete orar por nadie (30/09)', () => {
  const { TEXTOS } = require('../../utils/comentario-fijo');
  for (const texto of Object.values(TEXTOS).flat()) {
    assert.doesNotMatch(texto, /petici[oó]n|por qui[eé]n|oraremos|oramos por ti|entregarle a Dios esta noche/i, texto);
  }
});
