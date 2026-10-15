// 04/10/2026: "oración del día", Reel corto copiado de @graciasdios26.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const o = require('../../utils/oracion-corta');
const { textoParaRed } = require('../../utils/texto-social');

const larga = 'Gracias por este nuevo día y por cada persona que pusiste en mi camino. Pongo en tus manos mis preocupaciones, mi familia y mis pasos, porque sé que me sostienes';

test('validaOracion: saludo, sin Amén duplicado, límites de palabras y tono', () => {
  const v = o.validaOracion({ saludo: 'Señor.', texto: `${larga}. Amén.`, pie: 'Hoy oramos por ti.' });
  assert.equal(v.saludo, 'Señor.');
  assert.doesNotMatch(v.texto, /Amén/);
  assert.match(v.texto, /\.$/);
  assert.equal(o.validaOracion({ saludo: 'Hola', texto: larga }).saludo, 'Dios.');
  assert.throws(() => o.validaOracion({ texto: 'muy corta' }), /palabras/);
  assert.throws(() => o.validaOracion({ texto: `${larga} y aprende a orar conmigo` }), /Tono/);
});

test('duración: tiempo de leerla, entre 10 y 18 s', () => {
  assert.equal(o.duracion(20), 10);
  assert.equal(o.duracion(40), 16);
  assert.equal(o.duracion(80), 18);
});

test('texto de la publicación: la oración, intercesión, envío y crédito de música', () => {
  const t = o.textoPublicacion({ saludo: 'Dios.', texto: 'Gracias por hoy.', pie: 'Hoy oramos por ti.' }, '🎵 Música: X · CC BY 4.0');
  assert.match(t, /^Dios\. Gracias por hoy\. Amén\. 🙏/);
  assert.match(t, /hoy oramos por ti/);
  assert.match(t, /Envíala/);
  assert.match(t, /🎵 Música: X/);
  assert.ok((t.match(/#\S+/g) || []).length <= 5);
});

test('capa: la oración en pantalla, escapada, con Amén y la cuenta', () => {
  const h = o.htmlCapa({ saludo: 'Dios.', texto: 'Paz <script>' });
  assert.match(h, /Paz &lt;script&gt;/);
  assert.match(h, /Amén\./);
  assert.match(h, /@tu_cuenta/);
});

test('ffmpeg: fondo recortado a 9:16 en bucle + capa + música con fundidos', () => {
  const args = o.argumentosVideo({ fondo: 'f.mp4', capa: 'c.png', musica: 'm.mp3', segundos: 14, salida: 's.mp4' });
  const filtro = args[args.indexOf('-filter_complex') + 1];
  assert.match(filtro, /crop=1080:1920/);
  assert.match(filtro, /overlay=0:0/);
  assert.match(filtro, /afade=t=out:st=12.5/);
  assert.equal(args[args.indexOf('-t') + 1], '14');
  assert.ok(!o.argumentosVideo({ fondo: 'f', capa: 'c', musica: null, segundos: 10, salida: 's' }).includes('-c:a'));
});

test('fondos: descarga de Pexels solo si faltan, y no repite los recientes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fondos-'));
  const adapter = { search: async () => Array.from({ length: 10 }, (_, i) => ({ id: `pexels_video_${i}`, type: 'video', url: `https://v/${i}`, height: 1920 })) };
  const fetchImpl = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) });
  const f = await o.aseguraFondos({ dir, adapter, fetchImpl, minimo: 3 });
  assert.equal(f.length, 7); // mínimo + 4 de reserva
  const otra = await o.aseguraFondos({ dir, adapter: { search: async () => assert.fail('ya hay') }, minimo: 3 });
  assert.equal(otra.length, 7);
  const recientes = f.slice(0, 6).map(x => path.basename(x));
  assert.equal(o.eligeFondo(f, recientes), f[6]);
});

function dbFalsa(inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => (k in s ? s[k] : null), setSetting: async (k, v) => { s[k] = v; } };
}

test('publicaOracionDelDia: Instagram + Facebook, una vez al día desde las 09:00', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-'));
  const db = dbFalsa();
  const llamadas = { ig: [], fb: [], borradas: [] };
  const deps = {
    escribeOracion: async ({ momento }) => ({ momento, saludo: 'Dios.', texto: 'Gracias.', pie: '', palabras: 30 }),
    dibujaCapa: async (_o, salida) => salida, runFFmpeg: async () => {},
    aseguraFondos: async () => ['/fondos/a.mp4'], adapter: null,
    enlace: { dir: '/x', base: 'https://x' },
    publicaCopia: async f => ({ nombre: 'n.mp4', url: `https://x/${path.basename(f)}` }),
    borraCopia: async n => llamadas.borradas.push(n),
    preparaReelIG: async ({ caption }) => { llamadas.ig.push(caption); return { containerId: 'C', igUserId: 'IG' }; },
    estadoIG: async () => ({ status: 'FINISHED' }),
    publicaIG: async () => ({ mediaId: 'M', permalink: 'https://www.instagram.com/reel/x/' }),
    publicaReel: async ({ description }) => { llamadas.fb.push(description); return { videoId: 'F' }; },
    espera: async () => {}
  };
  const env = { INSTAGRAM_TOKEN: 'T', FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F' };
  assert.equal(await o.publicaOracionDelDia({ db, ai: {}, env, now: new Date('2026-10-05T12:00:00Z'), dataDir, deps }), null); // 08:00 NY
  const r = await o.publicaOracionDelDia({ db, ai: {}, env, now: new Date('2026-10-05T13:05:00Z'), dataDir, deps });
  assert.equal(r.status, 'published');
  assert.equal(r.redes.instagram.url, 'https://www.instagram.com/reel/x/');
  assert.equal(r.redes.facebook.url, 'https://www.facebook.com/reel/F');
  assert.match(llamadas.ig[0], /hoy oramos por ti/);
  assert.deepEqual(llamadas.borradas, ['n.mp4']);
  assert.deepEqual(JSON.parse(db.s.oracion_corta_fondos), ['a.mp4']);
  assert.equal(await o.publicaOracionDelDia({ db, ai: {}, env, now: new Date('2026-10-05T15:00:00Z'), dataDir, deps }), null);
  db.s.oracion_corta_enabled = 'false';
  assert.equal(await o.tocaHoy({ db, now: new Date('2026-10-06T14:00:00Z') }), null);
});

test('los textos de Shorts invitan a interceder (patrón de más comentarios)', () => {
  const seo = { title: 'T', description: 'Cuerpo.' };
  assert.match(textoParaRed(seo, 'instagram'), /nombre de alguien por quien quieres orar: hoy oramos por ti/);
  assert.match(textoParaRed(seo, 'facebook'), /hoy oramos por ti/);
});
