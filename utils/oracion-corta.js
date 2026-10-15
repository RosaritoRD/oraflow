/**
 * "Oración del día": Reel corto (10-18 s) para Instagram y Facebook (04/10/2026).
 *
 * Copiado del formato que más crece en el nicho (@graciasdios26, 178K
 * seguidores, 15-25K reproducciones por Reel, uno al día): vídeo vertical de
 * atardecer/mar/nubes + UNA oración corta en pantalla ("Dios. … Amén.") +
 * música suave. Corto a propósito: se lee entero y se vuelve a ver (bucle).
 * El texto invita a comentar a la manera de @misteriosdivinos05, la cuenta con
 * más comentarios del nicho ("Hoy oramos por ti… escribe Amén").
 *
 * Fondos: vídeos de Pexels (licencia libre, sin crédito obligatorio) guardados
 * en data/assets/fondos-oracion; se rotan sin repetir los últimos.
 * Settings: oracion_corta_enabled ('false' lo apaga), oracion_corta_time
 * (09:00 hora del canal = 07:00 en México), oracion_corta_last, oracion_corta_fondos.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { localDateKey, parseClock, zonedToUtc, DEFAULT_TZ } = require('./daily-slot');
const { runFFmpeg } = require('./ffmpeg');
const { extraeJson } = require('./carrusel-oracion');
const { eligeMusica, creditoMusica } = require('./carrusel-video');
const { REGLA_FE, conJesusRey } = require('./reglas-oracion');
const { lineaLibro } = require('./libro');

const FUENTES = path.join(__dirname, '..', 'assets', 'fonts');
const HORA_DEFECTO = '09:00';
const MAX_INTENTOS_DIA = 3;
const BUSQUEDAS = ['sunset ocean', 'sunrise clouds', 'golden hour sea', 'sky clouds light', 'calm sea sunrise', 'sun rays clouds'];
const MIN_FONDOS = 8;
const TONO_PROHIBIDO = /no\s+sabes?\s+(c[oó]mo\s+)?orar|no\s+sabes?\s+qu[eé]\s+decir|c[oó]mo\s+orar|aprende\s+a\s+orar|milagro\s+(garantizado|seguro)|te\s+sanar[aá]\s+hoy/i;
const MOMENTOS = ['para empezar el día dando gracias', 'para entregar a Dios las preocupaciones', 'para pedir paz en el corazón',
  'por la familia', 'para confiar en el tiempo de Dios', 'para pedir fuerzas en un día difícil', 'de gratitud por lo que tengo'];

function promptOracion(momento) {
  return `Escribe una oración cristiana breve en español ${momento}, para un Reel de Instagram de la cuenta "Oraciones en Presencia de Yeshua".
Devuelve SOLO un JSON válido:
{ "saludo": "Dios." o "Señor." o "Padre.", "texto": "la oración, 30-50 palabras, en primera persona, dirigida a Dios, cálida y concreta, sin la palabra Amén", "pie": "1 frase de intercesión para el texto de la publicación, empezando por 'Hoy oramos por ti' o similar" }
Reglas: frases cortas, español neutro, sin emojis, sin comillas dentro del texto, no prometas milagros ni curaciones, no insinúes que la persona no sabe orar.
${REGLA_FE}
(El «Amén» final lo pone el diseño: no lo escribas en "texto".)`;
}

function validaOracion(crudo) {
  const saludo = ['Dios.', 'Señor.', 'Padre.'].includes(String(crudo?.saludo || '').trim()) ? crudo.saludo.trim() : 'Dios.';
  const crudoTexto = String(crudo?.texto || '').replace(/\s+/g, ' ').replace(/\s*am[eé]n\.?\s*$/i, '').trim();
  const largo = crudoTexto.split(' ').filter(Boolean).length;
  if (largo < 22 || largo > 65) throw new Error(`Oración de ${largo} palabras`);
  const pie = String(crudo?.pie || '').trim().slice(0, 200);
  if (TONO_PROHIBIDO.test(crudoTexto) || TONO_PROHIBIDO.test(pie)) throw new Error('Tono no permitido');
  const texto = conJesusRey(crudoTexto); // regla de fe: Jesús de Nazaret, Rey de reyes
  return { saludo, texto, pie, palabras: texto.split(' ').filter(Boolean).length };
}

async function escribeOracion({ ai, momento, intentos = 3 }) {
  let ultimo;
  for (let i = 0; i < intentos; i += 1) {
    try {
      return { momento, ...validaOracion(extraeJson(await ai.generateText(promptOracion(momento), { maxTokens: 800, temperature: 0.8 }))) };
    } catch (error) { ultimo = error; }
  }
  throw new Error(`No se pudo escribir la oración: ${ultimo?.message}`);
}

/** Lo bastante para leerla con calma: ~3,2 palabras por segundo + 3 s, entre 10 y 18 s. */
const duracion = palabras => Math.min(18, Math.max(10, Math.round(palabras / 3.2 + 3)));

function textoPublicacion(o, credito = '') {
  return [
    `${o.saludo} ${o.texto} Amén. 🙏`,
    o.pie || 'Hoy oramos por ti y por los tuyos.',
    '🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.\n📩 Envíala a alguien que necesite leerla hoy.',
    lineaLibro(),
    '#oracion #oraciondeldia #fe #Dios #oraciondelamanana',
    credito
  ].filter(Boolean).join('\n\n');
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Capa transparente 1080×1920 con la oración (se pone encima del vídeo). */
function htmlCapa(o) {
  const f = n => `file://${path.join(FUENTES, n)}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('${f('Jost-VF.ttf')}'); font-weight: 100 900; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; background: transparent; }
  body { background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,.42) 0%, rgba(0,0,0,.22) 60%, rgba(0,0,0,.30) 100%); color: #fff; }
  .caja { position: absolute; left: 110px; right: 110px; top: 330px; bottom: 380px; display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center; font-family: 'Cormorant', serif;
    text-shadow: 0 2px 18px rgba(0,0,0,.55), 0 1px 3px rgba(0,0,0,.6); }
  .saludo { font-size: 66px; font-weight: 700; font-style: italic; margin-bottom: 38px; }
  .texto { font-size: 62px; line-height: 1.28; font-weight: 600; font-style: italic; }
  .amen { font-size: 66px; font-weight: 700; font-style: italic; margin-top: 40px; }
  .marca { position: absolute; bottom: 300px; width: 100%; text-align: center; font-family: 'Jost'; font-size: 26px;
    letter-spacing: .08em; color: rgba(255,255,255,.85); text-shadow: 0 1px 6px rgba(0,0,0,.6); }
  </style></head><body>
  <div class="caja"><div class="saludo">${esc(o.saludo)}</div><div class="texto">${esc(o.texto)}</div><div class="amen">Amén.</div></div>
  <div class="marca">@tu_cuenta</div>
  <script>document.fonts.ready.then(() => { const c = document.querySelector('.caja'); let g = 40;
    while (c.scrollHeight > c.clientHeight && g-- > 0) for (const el of c.children) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 0.95) + 'px';
    document.body.dataset.listo = '1'; });</script></body></html>`;
}

async function dibujaCapa(o, salida, { chromium = require('playwright').chromium } = {}) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oracion-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const html = path.join(tmp, 'capa.html');
    await fs.promises.writeFile(html, htmlCapa(o));
    await page.goto(`file://${html}`);
    await page.waitForFunction(() => document.body.dataset.listo === '1', null, { timeout: 15000 });
    await page.screenshot({ path: salida, type: 'png', omitBackground: true });
    return salida;
  } finally {
    await browser.close();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

function argumentosVideo({ fondo, capa, musica, segundos, salida }) {
  const filtros = [
    '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1[bg]',
    '[bg][1:v]overlay=0:0,format=yuv420p[v]'
  ];
  const args = ['-y', '-stream_loop', '-1', '-i', fondo, '-loop', '1', '-i', capa];
  const mapa = ['-map', '[v]'];
  if (musica) {
    args.push('-stream_loop', '-1', '-i', musica);
    filtros.push(`[2:a]atrim=0:${segundos},asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:d=1,afade=t=out:st=${segundos - 1.5}:d=1.5,aresample=48000[a]`);
    mapa.push('-map', '[a]');
  }
  args.push('-filter_complex', filtros.join(';'), ...mapa, '-t', String(segundos),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p',
    ...(musica ? ['-c:a', 'aac', '-b:a', '160k', '-ac', '2'] : []), '-movflags', '+faststart', salida);
  return args;
}

/** Asegura un surtido de fondos verticales de Pexels en disco. */
async function aseguraFondos({ dir, adapter, fetchImpl = fetch, minimo = MIN_FONDOS }) {
  await fs.promises.mkdir(dir, { recursive: true });
  const actuales = (await fs.promises.readdir(dir)).filter(f => f.endsWith('.mp4'));
  if (actuales.length >= minimo || !adapter) return actuales.map(f => path.join(dir, f));
  const encontrados = await adapter.search({ queries: BUSQUEDAS.slice(0, 3), preferredAssetType: 'video', orientation: 'portrait', minDurationSec: 8, limit: 15 });
  const videos = encontrados.filter(v => v.type === 'video' && v.height >= 1280);
  for (const v of videos) {
    if (actuales.length >= minimo + 4) break;
    const nombre = `${v.id}.mp4`;
    if (actuales.includes(nombre)) continue;
    const res = await fetchImpl(v.url);
    if (!res.ok) continue;
    const datos = Buffer.from(await res.arrayBuffer());
    if (datos.length > 80 * 1024 * 1024) continue;
    await fs.promises.writeFile(path.join(dir, nombre), datos);
    actuales.push(nombre);
  }
  return actuales.map(f => path.join(dir, f));
}

function eligeFondo(fondos, recientes = []) {
  const libres = fondos.filter(f => !recientes.includes(path.basename(f)));
  const lista = libres.length ? libres : fondos;
  return lista[Math.floor(Math.random() * lista.length)];
}

async function tocaHoy({ db, now = new Date() }) {
  if (await db.getSetting('oracion_corta_enabled') === 'false') return null;
  const tz = await db.getSetting('channel_timezone') || DEFAULT_TZ;
  const hoy = localDateKey(now, tz);
  const ultimo = JSON.parse(await db.getSetting('oracion_corta_last') || '{}');
  if (ultimo.fecha === hoy && (ultimo.status === 'published' || (ultimo.intentos || 0) >= MAX_INTENTOS_DIA)) return null;
  const reloj = parseClock(await db.getSetting('oracion_corta_time') || HORA_DEFECTO) || parseClock(HORA_DEFECTO);
  const [year, month, day] = hoy.split('-').map(Number);
  return now.getTime() >= zonedToUtc({ year, month, day, ...reloj }, tz) ? hoy : null;
}

/** Hace y publica la oración del día en las redes disponibles (cada red se apunta aparte). */
async function publicaOracionDelDia({
  db, ai, logger, env = process.env, now = new Date(), dataDir = path.join(process.cwd(), 'data'), deps = {}
}) {
  const hoy = await tocaHoy({ db, now });
  if (!hoy) return null;
  const ig = require('./instagram-reels');
  const fbMod = require('./facebook-reels');
  const enlaceMod = require('./enlace-publico');
  const d = {
    escribeOracion, dibujaCapa, runFFmpeg, aseguraFondos,
    adapter: (() => { try { const { PexelsAdapter } = require('./stock-adapters/pexels'); return new PexelsAdapter({ logger }); } catch (_e) { return null; } })(),
    enlace: enlaceMod.enlacePublicoConfig(env), publicaCopia: enlaceMod.publicaCopia, borraCopia: enlaceMod.borraCopia,
    preparaReelIG: ig.preparaReelIG, estadoIG: ig.estadoIG, publicaIG: ig.publicaIG, publicaReel: fbMod.publicaReel,
    espera: ms => new Promise(ok => setTimeout(ok, ms)), ...deps
  };
  const token = d.enlace ? await ig.tokenInstagram(db, env) : null;
  const fb = fbMod.facebookConfig(env);
  if (!token && !fb) return null;

  const anterior = JSON.parse(await db.getSetting('oracion_corta_last') || '{}');
  const mismoDia = anterior.fecha === hoy;
  const intentos = (mismoDia ? anterior.intentos || 0 : 0) + 1;
  const redes = mismoDia ? { ...(anterior.redes || {}) } : {};
  const tareas = [token && 'instagram', fb && 'facebook'].filter(t => t && redes[t]?.status !== 'published');
  if (!tareas.length) return null;

  const dia = Math.floor(now.getTime() / 86400000);
  const momento = MOMENTOS[dia % MOMENTOS.length];
  const tmp = await fs.promises.mkdtemp(path.join(dataDir, 'tmp-oracion-'));
  let copia = null;
  let fondoUsado = null;
  try {
    const recientes = JSON.parse(await db.getSetting('oracion_corta_fondos') || '[]');
    const fondos = await d.aseguraFondos({ dir: path.join(dataDir, 'assets', 'fondos-oracion'), adapter: d.adapter });
    if (!fondos.length) throw new Error('No hay vídeos de fondo (¿PEXELS_API_KEY?)');
    fondoUsado = eligeFondo(fondos, recientes);
    const oracion = await d.escribeOracion({ ai, momento });
    const capa = await d.dibujaCapa(oracion, path.join(tmp, 'capa.png'));
    const musicaDir = env.BACKGROUND_MUSIC_DIR;
    const musica = eligeMusica(musicaDir, now.getTime() + 43200000); // otra pista que la del carrusel
    const segundos = duracion(oracion.palabras);
    const video = path.join(tmp, 'oracion.mp4');
    await d.runFFmpeg(argumentosVideo({ fondo: fondoUsado, capa, musica, segundos, salida: video }));
    if (musica && !deps.runFFmpeg) await require('./sonoridad').normalizaVideo(video, { logger }); // música a -14 LUFS
    const texto = textoPublicacion(oracion, musica ? creditoMusica(musicaDir) : '');

    for (const red of tareas) {
      try {
        if (red === 'instagram') {
          copia = await d.publicaCopia(video, d.enlace);
          const { containerId, igUserId } = await d.preparaReelIG({ token, videoUrl: copia.url, caption: texto });
          let estado = 'IN_PROGRESS';
          for (let i = 0; i < 40 && estado === 'IN_PROGRESS'; i += 1) {
            ({ status: estado } = await d.estadoIG({ token, containerId }));
            if (estado === 'IN_PROGRESS') await d.espera(15000);
          }
          if (estado !== 'FINISHED') throw new Error(`Instagram: contenedor ${estado}`);
          const r = await d.publicaIG({ token, igUserId, containerId });
          redes.instagram = { status: 'published', mediaId: r.mediaId, url: r.permalink };
        } else {
          const r = await d.publicaReel({ config: fb, videoPath: video, description: texto, now });
          redes.facebook = { status: 'published', reelId: r.videoId, url: `https://www.facebook.com/reel/${r.videoId}` };
        }
        logger?.success?.(`Oración del día → ${red}: ${redes[red].url || 'ok'}`);
      } catch (error) {
        redes[red] = { status: 'failed', error: error.message };
        logger?.warn?.(`Oración del día → ${red} falló (intento ${intentos}): ${error.message}`);
      }
    }
  } catch (error) {
    for (const t of tareas) if (redes[t]?.status !== 'published') redes[t] = { status: 'failed', error: error.message };
    logger?.warn?.(`Oración del día falló (intento ${intentos}): ${error.message}`);
  } finally {
    if (copia) await d.borraCopia(copia.nombre, d.enlace);
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
  const todas = tareas.every(t => redes[t]?.status === 'published');
  const registro = { fecha: hoy, momento, status: todas ? 'published' : 'failed', redes, intentos, at: now.toISOString() };
  await db.setSetting('oracion_corta_last', JSON.stringify(registro));
  if (fondoUsado && Object.values(redes).some(r => r.status === 'published')) {
    const recientes = JSON.parse(await db.getSetting('oracion_corta_fondos') || '[]');
    await db.setSetting('oracion_corta_fondos', JSON.stringify([path.basename(fondoUsado), ...recientes].slice(0, 5)));
  }
  return registro;
}

module.exports = {
  publicaOracionDelDia,
  MOMENTOS, promptOracion, validaOracion, escribeOracion, duracion, textoPublicacion, htmlCapa, dibujaCapa,
  argumentosVideo, aseguraFondos, eligeFondo, tocaHoy, eligeMusica, creditoMusica, runFFmpeg
};
