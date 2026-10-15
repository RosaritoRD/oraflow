/**
 * Historia diaria en Instagram y Facebook que anuncia el vídeo largo de YouTube
 * (pedido del autor, 05/10/2026; formato de @oraconfe y @oracionparahoy:
 * "Oración para hoy 5 de octubre" + la miniatura + "VER VÍDEO").
 *
 * Cada vídeo largo que ya es público en YouTube (últimas 24 h) sale UNA vez
 * como historia 9:16 con su miniatura, la fecha y el título.
 * ⚠ La API de Meta NO deja poner stickers (ni el de enlace ni GIFs) en una
 * historia. Por eso (el autor, 05/10/2026):
 * - Facebook: sale sola (sin enlace; manda al perfil).
 * - Instagram: la sube el autor desde la app con el sticker de enlace escondido
 *   detrás de "VER ORACIÓN COMPLETA" (y la manito de "toca aquí" la pone él).
 *   El sistema le deja en el panel (/historia) la imagen y el enlace fijo /hoy. historia_ig_auto='true' vuelve a publicarla sola.
 *
 * Settings: historia_diaria_enabled ('false' la apaga), historia_ig_auto,
 * historia_hechas (JSON { youtubeId: { instagram, facebook, panel } }).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_TZ } = require('./daily-slot');
const { esc } = require('./carrusel-oracion');

const ANCHO = 1080;
const ALTO = 1920;
const MAX_INTENTOS = 3;
const FUENTES = path.join(__dirname, '..', 'assets', 'fonts');
const ENLACE_HOY = 'https://panel.tu-dominio.com/hoy';

/** "5 de octubre" en la zona del canal. */
function fechaCorta(now, tz = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: tz }).format(now);
}

/** Título legible: sin "| Isaías 26:3" ni emojis, y en minúsculas si viene todo en MAYÚSCULAS. */
function tituloHistoria(titulo) {
  let t = String(titulo || '').replace(/\s*\|\s*[^|]*\d+:\d+.*$/, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  if (t && t === t.toUpperCase()) t = t.toLowerCase().replace(/(^|[.:!?|]\s*)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
  return t.replace(/\s*\|\s*/g, ' · ').slice(0, 110);
}

function htmlHistoria({ miniatura, fecha, titulo }) {
  const f = n => `file://${path.join(FUENTES, n)}`;
  const img = `file://${miniatura}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('${f('Jost-VF.ttf')}'); font-weight: 100 900; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${ANCHO}px; height: ${ALTO}px; overflow: hidden; }
  body { position: relative; color: #fff; font-family: 'Cormorant', serif; background: #1d1611; }
  .fondo { position: absolute; inset: -60px; background: url('${img}') center/cover; filter: blur(38px) brightness(.55) saturate(1.1); }
  .velo { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,14,8,.35) 0%, rgba(20,14,8,.15) 45%, rgba(20,14,8,.65) 100%); }
  .arriba { position: absolute; top: 230px; width: 100%; text-align: center; text-shadow: 0 2px 16px rgba(0,0,0,.5); }
  .arriba h1 { font-size: 112px; font-weight: 700; font-style: italic; line-height: 1; }
  .arriba p { margin-top: 18px; font-family: 'Jost'; font-size: 34px; letter-spacing: .28em; text-transform: uppercase; color: #f3dfb8; }
  .marco { position: absolute; top: 560px; left: 70px; right: 70px; aspect-ratio: 16/9; border-radius: 26px; overflow: hidden;
    border: 6px solid rgba(255,255,255,.92); box-shadow: 0 26px 70px rgba(0,0,0,.55); background: url('${img}') center/cover; }
  .play { position: absolute; right: 26px; bottom: 26px; width: 104px; height: 104px; border-radius: 50%;
    background: rgba(0,0,0,.5); border: 4px solid rgba(255,255,255,.9); }
  .play::after { content: ''; position: absolute; left: 39px; top: 27px; border-style: solid; border-width: 23px 0 23px 36px; border-color: transparent transparent transparent #fff; }
  .titulo { position: absolute; top: 1150px; left: 90px; right: 90px; text-align: center; font-size: 62px; line-height: 1.16; font-weight: 600;
    text-shadow: 0 2px 14px rgba(0,0,0,.55); }
  .boton { position: absolute; top: 1480px; left: 140px; right: 140px; padding: 34px 20px; border-radius: 80px; background: #fff; color: #2b2520;
    text-align: center; font-family: 'Jost'; font-weight: 600; font-size: 40px; letter-spacing: .06em; }
  .nota { position: absolute; top: 1620px; width: 100%; text-align: center; font-family: 'Jost'; font-size: 28px; letter-spacing: .08em; color: rgba(255,255,255,.85); }
  .marca { position: absolute; bottom: 120px; width: 100%; text-align: center; font-style: italic; font-size: 34px; color: rgba(255,255,255,.8); }
  </style></head><body>
  <div class="fondo"></div><div class="velo"></div>
  <div class="arriba"><h1>Oración de hoy</h1><p>${esc(fecha)}</p></div>
  <div class="marco"><div class="play"></div></div>
  <div class="titulo">${esc(titulo)}</div>
  <div class="boton">VER ORACIÓN COMPLETA 🙏</div>
  <div class="nota">En YouTube · enlace en el perfil</div>
  <div class="marca">@tu_cuenta</div>
  <script>document.fonts.ready.then(() => { const t = document.querySelector('.titulo'); let g = 30;
    while (t.scrollHeight > 300 && g-- > 0) t.style.fontSize = (parseFloat(getComputedStyle(t).fontSize) * 0.95) + 'px';
    const i = new Image(); i.onload = i.onerror = () => { document.body.dataset.listo = '1'; }; i.src = '${img}'; });</script>
  </body></html>`;
}

async function renderizaHistoria(datos, salida, { chromium = require('playwright').chromium } = {}) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'historia-'));
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage({ viewport: { width: ANCHO, height: ALTO }, deviceScaleFactor: 1 });
    const archivo = path.join(tmp, 'historia.html');
    await fs.promises.writeFile(archivo, htmlHistoria(datos));
    await page.goto(`file://${archivo}`);
    await page.waitForFunction(() => document.body.dataset.listo === '1', null, { timeout: 20000 });
    await page.screenshot({ path: salida, type: 'jpeg', quality: 92 });
    return salida;
  } finally {
    await browser.close();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

/** Deja en data/historias la historia de hoy para el panel: hoy.jpg y hoy.json (la manito la pone el autor en la app). */
async function preparaPanel({ jpg, video, dir }) {
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.copyFile(jpg, path.join(dir, 'hoy.jpg'));
  await fs.promises.rm(path.join(dir, 'hoy.mp4'), { force: true });
  await fs.promises.writeFile(path.join(dir, 'hoy.json'), JSON.stringify({
    youtubeId: video.youtubeId, youtubeUrl: video.youtubeUrl, titulo: video.metadata?.seo?.title || video.title,
    enlace: ENLACE_HOY, at: new Date().toISOString()
  }));
}

/** Vídeos largos ya públicos en YouTube en las últimas 24 h, con miniatura. */
async function videosPendientes({ db, now, hechas, redes = ['instagram', 'facebook'] }) {
  const desde = new Date(now.getTime() - 24 * 3600000).toISOString();
  const entradas = (await db.getRecentPublishedForSocial?.(desde)) || [];
  return entradas.filter(e => {
    const m = e.metadata || {};
    const estado = hechas[e.youtubeId] || {};
    const listo = redes.every(r => ['published', 'listo'].includes(estado[r]?.status) || (estado[r]?.intentos || 0) >= MAX_INTENTOS);
    return m.contentFormat === 'long' && e.youtubeId && m.thumbnail?.path && Date.parse(e.publishTime) <= now.getTime() && !listo;
  });
}

/** Publica la historia de cada vídeo largo nuevo (Instagram y Facebook, cada red aparte). */
async function publicaHistorias({ db, logger, env = process.env, now = new Date(), dataDir = path.join(process.cwd(), 'data'), deps = {} }) {
  if (await db.getSetting('historia_diaria_enabled') === 'false') return [];
  const ig = require('./instagram-reels');
  const fbMod = require('./facebook-reels');
  const enlaceMod = require('./enlace-publico');
  const d = {
    renderizaHistoria, preparaPanel, enlace: enlaceMod.enlacePublicoConfig(env), publicaCopia: enlaceMod.publicaCopia, borraCopia: enlaceMod.borraCopia,
    preparaHistoriaIG: ig.preparaHistoriaIG, estadoIG: ig.estadoIG, publicaIG: ig.publicaIG, publicaHistoriaFB: fbMod.publicaHistoriaFB,
    tokenInstagram: ig.tokenInstagram, espera: ms => new Promise(ok => setTimeout(ok, ms)), existe: p => fs.existsSync(p), ...deps
  };
  const igAuto = await db.getSetting('historia_ig_auto') === 'true';
  const token = d.enlace && igAuto ? await d.tokenInstagram(db, env) : null;
  const fb = d.enlace ? fbMod.facebookConfig(env) : null;
  const redes = [token && 'instagram', fb && 'facebook', 'panel'].filter(Boolean);
  const tz = await db.getSetting('channel_timezone') || DEFAULT_TZ;
  const hechas = JSON.parse(await db.getSetting('historia_hechas') || '{}');
  const resultados = [];

  for (const video of await videosPendientes({ db, now, hechas, redes })) {
    const estado = { ...(hechas[video.youtubeId] || {}) };
    const tareas = redes.filter(r => !['published', 'listo'].includes(estado[r]?.status) && (estado[r]?.intentos || 0) < MAX_INTENTOS);
    if (!tareas.length || !d.existe(video.metadata.thumbnail.path)) continue;
    const tmp = await fs.promises.mkdtemp(path.join(dataDir, 'tmp-historia-'));
    let copia = null;
    try {
      const jpg = await d.renderizaHistoria({
        miniatura: video.metadata.thumbnail.path, fecha: fechaCorta(new Date(video.publishTime), tz),
        titulo: tituloHistoria(video.metadata.seo?.title || video.title)
      }, path.join(tmp, 'historia.jpg'));
      if (tareas.some(r => r !== 'panel')) copia = await d.publicaCopia(jpg, d.enlace);
      for (const red of tareas) {
        const intentos = (estado[red]?.intentos || 0) + 1;
        try {
          if (red === 'panel') {
            await d.preparaPanel({ jpg, video, dir: path.join(dataDir, 'historias') });
            estado.panel = { status: 'listo', intentos };
          } else if (red === 'instagram') {
            const { containerId, igUserId } = await d.preparaHistoriaIG({ token, imageUrl: copia.url });
            let st = 'IN_PROGRESS';
            for (let i = 0; i < 20 && st === 'IN_PROGRESS'; i += 1) {
              ({ status: st } = await d.estadoIG({ token, containerId }));
              if (st === 'IN_PROGRESS') await d.espera(5000);
            }
            if (st !== 'FINISHED') throw new Error(`Instagram: contenedor ${st}`);
            const r = await d.publicaIG({ token, igUserId, containerId });
            estado.instagram = { status: 'published', mediaId: r.mediaId, intentos };
          } else {
            const r = await d.publicaHistoriaFB({ config: fb, imageUrl: copia.url });
            estado.facebook = { status: 'published', postId: r.postId, intentos };
          }
          logger?.success?.(`Historia de ${video.youtubeUrl} → ${red}`);
        } catch (error) {
          estado[red] = { status: 'failed', error: error.message, intentos };
          logger?.warn?.(`Historia → ${red} falló (intento ${intentos}): ${error.message}`);
        }
      }
    } catch (error) {
      for (const r of tareas) estado[r] = { status: 'failed', error: error.message, intentos: (estado[r]?.intentos || 0) + 1 };
      logger?.warn?.(`Historia de ${video.youtubeId} falló: ${error.message}`);
    } finally {
      if (copia && d.enlace) await d.borraCopia(copia.nombre, d.enlace);
      await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
    hechas[video.youtubeId] = { ...estado, at: now.toISOString() };
    resultados.push({ youtubeId: video.youtubeId, ...estado });
  }
  if (resultados.length) {
    const recientes = Object.entries(hechas).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 12);
    await db.setSetting('historia_hechas', JSON.stringify(Object.fromEntries(recientes)));
  }
  return resultados;
}

module.exports = { ENLACE_HOY, preparaPanel, fechaCorta, tituloHistoria, htmlHistoria, renderizaHistoria, videosPendientes, publicaHistorias };
