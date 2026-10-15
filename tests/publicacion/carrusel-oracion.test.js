// 04/10/2026: carrusel de oraciones con versículos para Instagram.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const c = require('../../utils/carrusel-oracion');
const { tocaHoy, publicaCarruselDelDia } = require('../../utils/carrusel-diario');
const { preparaCarruselIG } = require('../../utils/instagram-reels');

const BIBLIA = {
  Salmos: { 4: { 8: 'En paz me acostaré, y asimismo dormiré; porque solo tú, Jehová, me harás estar confiado.' },
    92: { 1: 'Bueno es alabar a Jehová,', 2: 'Anunciar por la mañana tu misericordia, y tu verdad en las noches,' } },
  '1 Pedro': { 5: { 7: 'Echando toda vuestra solicitud en él, porque él tiene cuidado de vosotros.' } },
  Filipenses: { 4: { 6: 'Por nada estéis afanosos;', 7: 'Y la paz de Dios guardará vuestros corazones.' } }
};

test('el versículo sale de la Biblia, nunca de la IA', () => {
  assert.equal(c.buscaVersiculo('Salmo 4:8', BIBLIA).cita, 'Salmos 4:8');
  assert.equal(c.buscaVersiculo('1 pedro 5:7', BIBLIA).texto, BIBLIA['1 Pedro'][5][7]);
  assert.equal(c.buscaVersiculo('Filipenses 4:6-7', BIBLIA).cita, 'Filipenses 4:6-7');
  assert.equal(c.buscaVersiculo('Salmos 92:1-2', BIBLIA).texto.endsWith('noches…'), true); // a media frase → …
  assert.equal(c.buscaVersiculo('Salmos 4:99', BIBLIA), null); // no existe
  assert.equal(c.buscaVersiculo('Hechos 2:1', BIBLIA), null);
  assert.equal(c.buscaVersiculo('Salmos 4:1-9', BIBLIA), null); // más de 3
  assert.equal(c.buscaVersiculo('no es una cita', BIBLIA), null);
});

const larga = 'Señor, gracias por este día y por cada persona que pusiste en mi camino. Te entrego lo que no pude resolver y descanso en tu cuidado fiel esta noche, sabiendo que estás conmigo siempre.';

test('validaContenido descarta citas inventadas y exige 3 oraciones válidas', () => {
  const crudo = {
    portada: 'Para cuando el corazón no encuentra paz al llegar la noche', destacado: 'no encuentra paz', subtitulo: 'Ora conmigo estas palabras:',
    oraciones: [
      { texto: larga, cita: 'Salmos 4:8' },
      { texto: larga, cita: '1 Pedro 5:7' },
      { texto: larga, cita: 'Hechos 99:1' }, // inventada → fuera
      { texto: larga, cita: 'Filipenses 4:6-7' }
    ],
    pie: 'Descansa en Dios.'
  };
  const d = c.validaContenido(crudo, BIBLIA, 'antes de dormir');
  assert.equal(d.oraciones.length, 3);
  assert.ok(d.oraciones.every(o => /Amén\.$/.test(o.texto)));
  assert.equal(d.destacado, 'no encuentra paz');
  crudo.oraciones = crudo.oraciones.slice(0, 2);
  assert.throws(() => c.validaContenido(crudo, BIBLIA, 'x'), /Solo 2/);
});

test('nunca una portada que diga que la gente no sabe orar', () => {
  const oraciones = [{ texto: larga, cita: 'Salmos 4:8' }, { texto: larga, cita: '1 Pedro 5:7' }, { texto: larga, cita: 'Filipenses 4:6-7' }];
  for (const portada of ['¿No sabes qué decirle a Dios antes de dormir?', '¿Llegas cansado y no sabes cómo orar?',
    'Aprende a orar antes de dormir', 'Cómo orar cuando tienes ansiedad', '¿No sabes orar? Empieza aquí']) {
    assert.throws(() => c.validaContenido({ portada, oraciones }, BIBLIA, 't'), /no sabe orar/, portada);
  }
  assert.throws(() => c.validaContenido({ portada: 'Para cuando la noche pesa', subtitulo: 'Si no sabes qué decir, ora así:', oraciones }, BIBLIA, 't'), /no sabe orar/);
  assert.ok(c.validaContenido({ portada: 'Oraciones para entregarle a Dios el cansancio de hoy', oraciones }, BIBLIA, 't'));
  assert.doesNotMatch(c.promptContenido('antes de dormir'), /No sabes qué decirle/);
});

test('extraeJson tolera ```json y texto alrededor', () => {
  assert.deepEqual(c.extraeJson('Aquí está:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => c.extraeJson('sin json'), /JSON/);
});

test('texto del carrusel: gancho, guardar/enviar/Amén y 5 hashtags como máximo', () => {
  const t = c.textoCarrusel({ portada: '¿No sabes qué decirle a Dios?', pie: 'Descansa.', tema: 'antes de dormir' });
  assert.match(t, /^¿No sabes/);
  assert.match(t, /Guarda/);
  assert.match(t, /Envíalas/);
  assert.match(t, /Reina-Valera 1909/);
  assert.equal((t.match(/#\S+/g) || []).length, 5);
});

test('diapositivas: portada + una por oración + cierre, con el versículo y su cita', () => {
  const d = c.validaContenido({ portada: 'Para cuando el corazón no encuentra paz al llegar la noche', destacado: 'no encuentra paz',
    oraciones: [{ texto: larga, cita: 'Salmos 4:8' }, { texto: larga, cita: '1 Pedro 5:7' }, { texto: larga, cita: 'Filipenses 4:6-7' }] }, BIBLIA, 't');
  const h = c.diapositivas(d);
  assert.equal(h.length, 5);
  assert.match(h[0], /<em>no encuentra paz<\/em>/);
  assert.match(h[1], /Salmos 4:8 · RV1909/);
  assert.match(h[4], /Comenta un Amén/);
  assert.doesNotMatch(h.join(''), /<script>alert/);
});

test('el tema rota y evita los últimos usados', () => {
  const usados = c.TEMAS.slice(0, c.TEMAS.length - 1);
  assert.equal(c.temaDelDia(new Date(), usados), c.TEMAS.at(-1));
});

test('Instagram: carrusel = un contenedor por imagen + CAROUSEL con todos', async () => {
  const cuerpos = [];
  let n = 0;
  const fetchImpl = async (url, opts = {}) => {
    if (String(url).includes('/me?')) return { ok: true, json: async () => ({ user_id: 'IG1' }) };
    cuerpos.push(new URLSearchParams(opts.body));
    n += 1;
    return { ok: true, json: async () => ({ id: `C${n}` }) };
  };
  const r = await preparaCarruselIG({ token: 'T', imageUrls: ['https://x/1.jpg', 'https://x/2.jpg'], caption: 'Hola', fetchImpl });
  assert.equal(cuerpos[0].get('is_carousel_item'), 'true');
  assert.equal(cuerpos[0].get('image_url'), 'https://x/1.jpg');
  assert.equal(cuerpos[2].get('media_type'), 'CAROUSEL');
  assert.equal(cuerpos[2].get('children'), 'C1,C2');
  assert.equal(cuerpos[2].get('caption'), 'Hola');
  assert.deepEqual(r, { containerId: 'C3', igUserId: 'IG1' });
  await assert.rejects(preparaCarruselIG({ token: 'T', imageUrls: ['a'], fetchImpl }), /entre 2 y 10/);
});

function dbFalsa(inicial = {}) {
  const s = { ...inicial };
  return { s, getSetting: async k => (k in s ? s[k] : null), setSetting: async (k, v) => { s[k] = v; } };
}

test('tocaHoy: apagado por defecto, a partir de su hora y una vez al día', async () => {
  const mediodia = new Date('2026-10-04T16:30:00Z'); // 12:30 NY
  assert.equal(await tocaHoy({ db: dbFalsa(), now: mediodia }), null);
  const db = dbFalsa({ instagram_carousel_enabled: 'true' });
  assert.equal(await tocaHoy({ db, now: new Date('2026-10-04T14:00:00Z') }), null); // 10:00 NY
  assert.equal(await tocaHoy({ db, now: mediodia }), '2026-10-04');
  db.s.instagram_carousel_last = JSON.stringify({ fecha: '2026-10-04', status: 'published' });
  assert.equal(await tocaHoy({ db, now: mediodia }), null);
  db.s.instagram_carousel_last = JSON.stringify({ fecha: '2026-10-04', status: 'failed', intentos: 3 });
  assert.equal(await tocaHoy({ db, now: mediodia }), null);
});

const dirTmp = () => fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'carr-'));
const MEDIODIA = new Date('2026-10-04T16:30:00Z'); // 12:30 NY

function depsFalsas(extra = {}) {
  const llamadas = { borradas: [], fb: [], igCarrusel: [], igReel: [], renders: [] };
  const deps = {
    enlace: { dir: '/x', base: 'https://x' },
    generaContenido: async ({ tema }) => ({ tema, portada: 'Para cuando la noche pesa', pie: '', oraciones: [] }),
    renderiza: async (datos, dir, o = {}) => { llamadas.renders.push(o.video ? 'video' : 'imagenes'); return ['/a.jpg', '/b.jpg']; },
    hazVideo: async () => ({ ruta: '/reel.mp4', segundos: 60, credito: '🎵 Música: Autor · CC BY 4.0' }),
    publicaCopia: async f => ({ nombre: f.slice(1), url: `https://x${f}` }),
    borraCopia: async n => llamadas.borradas.push(n),
    preparaCarruselIG: async ({ imageUrls, caption }) => { llamadas.igCarrusel.push({ imageUrls, caption }); return { containerId: 'C', igUserId: 'IG' }; },
    preparaReelIG: async ({ videoUrl, caption }) => { llamadas.igReel.push({ videoUrl, caption }); return { containerId: 'R', igUserId: 'IG' }; },
    estadoIG: async () => ({ status: 'FINISHED' }),
    publicaIG: async ({ containerId }) => ({ mediaId: `M-${containerId}`, permalink: `https://www.instagram.com/p/${containerId}/` }),
    publicaReel: async ({ description }) => { llamadas.fb.push(description); return { videoId: 'FB1', state: 'PUBLISHED' }; },
    espera: async () => {},
    ...extra
  };
  return { deps, llamadas };
}
const ENV_TODO = { INSTAGRAM_TOKEN: 'T', FACEBOOK_PAGE_ID: 'P', FACEBOOK_PAGE_TOKEN: 'F' };

test('por defecto: carrusel de imágenes en Instagram + Reel con música en Facebook', async () => {
  const db = dbFalsa({ instagram_carousel_enabled: 'true' });
  const { deps, llamadas } = depsFalsas();
  const r = await publicaCarruselDelDia({ db, ai: {}, now: MEDIODIA, dirBase: dirTmp(), env: ENV_TODO, deps });
  assert.equal(r.status, 'published');
  assert.deepEqual(Object.keys(r.redes).sort(), ['facebook_reel', 'instagram_carrusel']);
  assert.deepEqual(llamadas.igCarrusel[0].imageUrls, ['https://x/a.jpg', 'https://x/b.jpg']);
  assert.doesNotMatch(llamadas.igCarrusel[0].caption, /Música/); // las imágenes no llevan música
  assert.match(llamadas.fb[0], /🎵 Música: Autor · CC BY 4.0/); // el Reel sí, con su crédito
  assert.equal(r.redes.facebook_reel.url, 'https://www.facebook.com/reel/FB1');
  assert.deepEqual(llamadas.borradas, ['a.jpg', 'b.jpg']);
  assert.equal(JSON.parse(db.s.instagram_carousel_temas)[0], r.tema);
  assert.equal(await tocaHoy({ db, now: new Date('2026-10-04T18:00:00Z') }), null);
});

test('formato reel/ambos en Instagram: el vídeo con música sube como Reel', async () => {
  for (const formato of ['reel', 'ambos']) {
    const db = dbFalsa({ instagram_carousel_enabled: 'true', instagram_carousel_format: formato, facebook_carousel_reel: 'false' });
    const { deps, llamadas } = depsFalsas();
    const r = await publicaCarruselDelDia({ db, ai: {}, now: MEDIODIA, dirBase: dirTmp(), env: ENV_TODO, deps });
    assert.equal(r.status, 'published');
    assert.equal(llamadas.igReel.length, 1);
    assert.equal(llamadas.igReel[0].videoUrl, 'https://x/reel.mp4');
    assert.match(llamadas.igReel[0].caption, /Música/);
    assert.equal(llamadas.igCarrusel.length, formato === 'ambos' ? 1 : 0);
    assert.equal(llamadas.fb.length, 0);
  }
});

test('sin enlace público de Instagram, Facebook sale igual', async () => {
  const db = dbFalsa({ instagram_carousel_enabled: 'true' });
  const { deps, llamadas } = depsFalsas({ enlace: null });
  const r = await publicaCarruselDelDia({ db, ai: {}, now: MEDIODIA, dirBase: dirTmp(), env: { ...ENV_TODO }, deps });
  assert.deepEqual(Object.keys(r.redes), ['facebook_reel']);
  assert.equal(llamadas.igCarrusel.length, 0);
  assert.deepEqual(llamadas.renders, ['video']);
});

test('si una red falla, el reintento solo repite esa y con el mismo tema', async () => {
  const db = dbFalsa({ instagram_carousel_enabled: 'true' });
  let falla = true;
  const { deps, llamadas } = depsFalsas({
    preparaCarruselIG: async () => { if (falla) throw new Error('token caducado'); return { containerId: 'C', igUserId: 'IG' }; }
  });
  const r1 = await publicaCarruselDelDia({ db, ai: {}, now: MEDIODIA, dirBase: dirTmp(), env: ENV_TODO, deps });
  assert.equal(r1.status, 'failed');
  assert.equal(r1.redes.facebook_reel.status, 'published');
  assert.match(r1.redes.instagram_carrusel.error, /token caducado/);
  assert.deepEqual(llamadas.borradas, ['a.jpg', 'b.jpg']); // copias borradas aunque falle
  falla = false;
  const r2 = await publicaCarruselDelDia({ db, ai: {}, now: new Date('2026-10-04T16:45:00Z'), dirBase: dirTmp(), env: ENV_TODO, deps });
  assert.equal(r2.status, 'published');
  assert.equal(r2.intentos, 2);
  assert.equal(r2.tema, r1.tema);
  assert.equal(llamadas.fb.length, 1); // Facebook no se repite
});

test('vídeo del carrusel: tiempos de lectura, ≤ 89 s, música con fundidos y crédito CC BY', () => {
  const v = require('../../utils/carrusel-video');
  const corta = { oraciones: [{ texto: 'a '.repeat(30), versiculo: { texto: 'b '.repeat(10) } }] };
  assert.deepEqual(v.duraciones(corta), [4, 10, 5]);
  const muchas = { oraciones: Array.from({ length: 8 }, () => ({ texto: 'a '.repeat(80), versiculo: { texto: 'b' } })) };
  const t = v.duraciones(muchas);
  assert.ok(t.reduce((x, y) => x + y, 0) - 0.7 * (t.length - 1) <= 89.01);
  const { args, total } = v.argumentosFFmpeg({ imagenes: ['1.jpg', '2.jpg', '3.jpg'], tiempos: [4, 10, 5], musica: 'm.mp3', salida: 'o.mp4' });
  assert.equal(total, 17.6);
  const filtro = args[args.indexOf('-filter_complex') + 1];
  assert.match(filtro, /xfade=transition=fade:duration=0.7:offset=3.30/);
  assert.match(filtro, /xfade=transition=fade:duration=0.7:offset=12.60\[v\]/);
  assert.match(filtro, /afade=t=in/);
  assert.match(filtro, /afade=t=out:st=15.10/);
  assert.ok(args.includes('-stream_loop'));
  const dir = dirTmp();
  fs.writeFileSync(require('path').join(dir, 'LICENCIA.md'), 'Meditation — Kevin MacLeod (incompetech.com)\nLicencia: Creative Commons Attribution 4.0 (CC BY 4.0)');
  assert.equal(v.creditoMusica(dir), '🎵 Música: Kevin MacLeod (incompetech.com) · CC BY 4.0');
  assert.equal(v.eligeMusica(dir), null);
  fs.writeFileSync(require('path').join(dir, 'a.mp3'), 'x');
  assert.match(v.eligeMusica(dir), /a\.mp3$/);
});

test('«para empezar la semana» solo sale los lunes (hora de Nueva York) (07/10/2026)', () => {
  const miercoles = new Date('2026-10-07T16:00:00Z');
  for (let i = 0; i < 40; i += 1) {
    const d = new Date(miercoles.getTime() + i * 86400000);
    const lunes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(d) === 'Mon';
    if (!lunes) assert.notEqual(c.temaDelDia(d, []), 'para empezar la semana');
  }
  const lunes = new Date('2026-10-12T16:00:00Z');
  assert.equal(c.temaDelDia(lunes, []), 'para empezar la semana');
  assert.notEqual(c.temaDelDia(lunes, ['para empezar la semana']), 'para empezar la semana'); // ya salió: rota normal
  // domingo 23:30 en Nueva York (lunes en UTC) todavía no es lunes
  assert.notEqual(c.temaDelDia(new Date('2026-10-12T03:30:00Z'), []), 'para empezar la semana');
});
