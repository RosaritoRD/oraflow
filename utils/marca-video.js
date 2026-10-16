/**
 * Branding on long videos (02/10/2026, approved by the owner). Inspired by the format of
 * the niche's big channels, with an in-house design:
 *  - 8 s intro: clouds in golden sepia and three cards in Cinzel (a greeting for the time
 *    of day + the channel's name on two lines), soft piano. It's glued IN FRONT of the
 *    already mixed video, so voice, music and captions don't shift against each other.
 *  - Body: channel name top-right, logo bottom-right and the «like · SUBSCRIBE → SUBSCRIBED
 *    · bell» animation at 3 s (0:11 of the final video). Burned in the same pass as the
 *    captions, at no extra render cost.
 * If anything fails the video goes out unbranded, it's never lost. BRAND_VIDEO=0 turns it
 * off.
 * ⚠ blend needs format=gbrp in front: with rgb24 it tints the image magenta.
 */
const fs = require('fs').promises;
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');

const VERSION = 'v2';
const INTRO_SEG = 8;
const SUSCRIBIR_EN = 3;
const NOMBRE = 'ORACIONES EN PRESENCIA DE JESHUA';

const saludoDe = momento => ({ manana: 'BUENOS DÍAS', tarde: 'BUENAS TARDES', noche: 'BUENAS NOCHES' }[momento] || 'BUENOS DÍAS');
const marcaActiva = (env = process.env) => env.BRAND_VIDEO !== '0';
const nombreCanal = (env = process.env) => String(env.BRAND_CHANNEL_NAME || NOMBRE).toUpperCase();

function lineasIntro(momento, env = process.env) {
  const lineas = String(env.BRAND_INTRO_LINES || 'ORACIONES EN PRESENCIA|DE JESHUA').split('|').map(s => s.trim().toUpperCase()).filter(Boolean);
  return [saludoDe(momento), ...lineas.slice(0, 2)];
}

/** drawtext: «:» separates options and «'» closes the text. */
const escapaTexto = t => String(t).replace(/\\/g, '').replace(/:/g, '\\:').replace(/'/g, '\u2019');
const rutaFiltro = p => String(p).replace(/\\/g, '/').replace(/'/g, "\\'").replace(/:/g, '\\:');

function rutas(dataRoot) {
  const a = path.join(dataRoot, 'assets');
  return {
    nubes: path.join(a, 'marca', 'intro', 'nubes-12860112.mp4'),
    logo: path.join(a, 'marca', 'logo.png'),
    musica: path.join(a, 'music', 'Meditation_Impromptu_02.mp3'),
    cinzel: path.join(a, 'fuentes', 'Cinzel.ttf'),
    bebas: path.join(a, 'fuentes', 'BebasNeue.ttf'),
    suscribir: path.join(a, 'marca', `suscribir-${VERSION}`),
    extras: path.join(a, 'marca', 'extras'),
    cache: path.join(a, 'marca', 'intro', 'cache')
  };
}

/** Safe text for ASS: no braces or slashes (they're style tags). */
const assTexto = t => String(t).replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ');
const assHora = seg => { const cs = Math.round(seg * 100); const h = Math.floor(cs / 360000), m = Math.floor(cs / 6000) % 60, sg = Math.floor(cs / 100) % 60; return `${h}:${String(m).padStart(2, '0')}:${String(sg).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`; };
const cabeceraAss = (width, height, estilos) => `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n${estilos.join('\n')}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

/** Channel name top-right for the whole video (Bebas Neue). */
function assNombre({ nombre, width = 1920, height = 1080 }) {
  const k = width / 1920;
  return cabeceraAss(width, height, [`Style: Nombre,Bebas Neue,${Math.round(58 * k)},&H14FFFFFF,&H14FFFFFF,&H00000000,&H8C000000,0,0,0,0,100,100,1,0,1,0,2,9,0,${Math.round(40 * k)},${Math.round(26 * k)},1`])
    + `Dialogue: 0,0:00:00.00,9:59:59.00,Nombre,,0,0,0,,${assTexto(nombre)}\n`;
}

/** The intro's three cards (Cinzel), with fade in and fade out. */
function assIntro({ lineas, width = 1920, height = 1080 }) {
  const k = height / 1080;
  const [l1, l2, l3] = lineas;
  const tarjetas = [[l1, 0.3, 2.9, 140], [l2, 3.0, 5.5, l2.length > 18 ? 112 : 150], [l3, 5.6, 8.0, 175]];
  const estilos = tarjetas.map((_, n) => `Style: T${n},Cinzel,${Math.round(tarjetas[n][3] * k)},&H00E6F6FF,&H00E6F6FF,&H665AA2C9,&H6608243B,0,0,0,0,100,100,2,0,1,1,${Math.max(1, Math.round(3 * k))},5,0,0,${Math.round(40 * k)},1`);
  return cabeceraAss(width, height, estilos)
    + tarjetas.map(([t, de, a], n) => `Dialogue: 0,${assHora(de)},${assHora(a)},T${n},,0,0,0,,{\\fad(700,600)}${assTexto(t)}`).join('\n') + '\n';
}

/**
 * Timeline pass 3: inputs 0 = video, 1 = logo, 2… = one PNG sequence per animation
 * (Video elements, utils/extras-video.js), each at its time.
 * Without `animaciones`, the subscribe one at `inicioSuscribir` as before.
 */
function filtroCuerpo({ assPath, nombreAss, fontsDir, inicioSuscribir = SUSCRIBIR_EN, width = 1920, animaciones = null }) {
  const k = width / 1920;
  const subs = assPath ? `subtitles='${rutaFiltro(assPath)}',` : '';
  const lado = Math.round(130 * k);
  const anims = Array.isArray(animaciones) ? animaciones : [{ inicio: inicioSuscribir }];
  const partes = [
    `[0:v]${subs}subtitles='${rutaFiltro(nombreAss)}':fontsdir='${rutaFiltro(fontsDir)}'[mb]`,
    `[1:v]scale=${lado}:${lado},format=rgba,colorchannelmixer=aa=0.85[ml]`,
    `[mb][ml]overlay=W-w-${Math.round(36 * k)}:H-h-${Math.round(28 * k)}[mc]`
  ];
  if (!anims.length) return [...partes, '[mc]format=yuv420p[vout]'].join(';');
  let previo = 'mc';
  anims.forEach((a, i) => {
    const fin = i === anims.length - 1;
    partes.push(`[${i + 2}:v]setpts=PTS-STARTPTS+${Number(a.inicio)}/TB[a${i}]`);
    partes.push(`[${previo}][a${i}]overlay=eof_action=pass${fin ? ',format=yuv420p[vout]' : `[c${i}]`}`);
    previo = `c${i}`;
  });
  return partes.join(';');
}

/**
 * Shorts (vertical, 03/10/2026): from the 1920x1080 animation only the buttons matter
 * (like · SUBSCRIBE · bell, y = 300); they're cropped and enlarged to 85 % of the
 * width, at the very top, where they don't cover captions. Inputs: 0 = video, 1… =
 * one sequence per animation.
 */
function filtroShort({ assPath, animaciones = [], width = 1080, height = 1920 }) {
  const ancho = Math.round(width * 0.85);
  const y = Math.round(height * 0.17);
  const partes = [assPath ? `[0:v]subtitles='${rutaFiltro(assPath)}'[mb]` : '[0:v]null[mb]'];
  let previo = 'mb';
  animaciones.forEach((a, i) => {
    const fin = i === animaciones.length - 1;
    partes.push(`[${i + 1}:v]crop=720:200:640:210,scale=${ancho}:-1,setpts=PTS-STARTPTS+${Number(a.inicio)}/TB[a${i}]`);
    partes.push(`[${previo}][a${i}]overlay=(W-w)/2:${y}:eof_action=pass${fin ? ',format=yuv420p[vout]' : `[c${i}]`}`);
    previo = `c${i}`;
  });
  if (!animaciones.length) partes.push('[mb]format=yuv420p[vout]');
  return partes.join(';');
}

/** What a Short's pass 3 needs: the subscribe animation, if it applies. */
async function marcaShort({ dataRoot, logger = console, extras = null, duracion = null }) {
  if (!marcaActiva() || !duracion) return null;
  try {
    if (!(await tieneFiltro('subtitles'))) throw new Error('this ffmpeg has no subtitles filter');
    const { planDeExtras } = require('./extras-video');
    const plan = planDeExtras({ extras, duracion, formato: 'short' });
    if (!plan.length) return null;
    const dir = await animacionSuscribir(rutas(dataRoot).suscribir);
    logger.info?.(`Short: subscribe at ${Math.round(plan[0].inicio)} s`);
    return { short: true, animaciones: plan.map(p => ({ ...p, secuencia: path.join(dir, 'f%03d.png') })) };
  } catch (error) {
    logger.warn?.(`Subscribe on the Short not applied (${error.message})`);
    return null;
  }
}

const claveIntro = ({ width, height, fps, momento }) => `intro-${VERSION}-${width}x${height}-${fps}-${momento}`;
const concatCuadra = (intro, cuerpo, total) => Math.abs(Number(intro) + Number(cuerpo) - Number(total)) <= 0.3;

async function existe(p) { return fs.stat(p).then(() => true).catch(() => false); }

async function sondea(file) {
  const { getFFmpegPath } = require('./ffmpeg');
  const { execFile } = require('child_process');
  const junto = getFFmpegPath().replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1');
  const args = ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,time_base,sample_rate,channels', '-of', 'json', file];
  let out = null, ultimo = null;
  // ffmpeg-static doesn't ship ffprobe: the one next to it is tried, then the system one (like timeline-renderer).
  for (const bin of [...new Set([process.env.FFPROBE_PATH, junto, 'ffprobe'].filter(Boolean))]) {
    try { out = await new Promise((resolve, reject) => execFile(bin, args, { maxBuffer: 4 * 1024 * 1024 }, (e, so) => (e ? reject(e) : resolve(so)))); break; } catch (e) { ultimo = e; }
  }
  if (out === null) throw ultimo || new Error('no ffprobe');
  const j = JSON.parse(out);
  const v = j.streams.find(s => s.codec_type === 'video') || {};
  const a = j.streams.find(s => s.codec_type === 'audio') || null;
  return { duracion: Number(j.format?.duration) || 0, timescale: Number(String(v.time_base || '1/15360').split('/')[1]) || 15360, audio: a && { rate: Number(a.sample_rate) || 44100, canales: Number(a.channels) || 2 } };
}

/** 105 PNGs with the animation (in-house design); generated once and kept in assets. */
async function animacionSuscribir(dir, sharp = require('./safe-sharp')) {
  if (await existe(path.join(dir, 'f104.png'))) return dir;
  await fs.mkdir(dir, { recursive: true });
  const { svgSuscribir } = require('./marca-suscribir-svg');
  for (let i = 0; i < 105; i++) {
    await sharp(Buffer.from(svgSuscribir(i / 30))).png().toFile(path.join(dir, `f${String(i).padStart(3, '0')}.png`));
  }
  return dir;
}

/** Intro encoded the same as the final video (same x264, fps, timescale and audio) to join without re-encoding. */
async function intro({ dataRoot, width, height, fps, momento, encode, timescale, audio }) {
  const r = rutas(dataRoot);
  for (const p of [r.nubes, r.logo, r.musica, r.cinzel]) if (!(await existe(p))) throw new Error(`missing ${path.basename(p)}`);
  await fs.mkdir(r.cache, { recursive: true });
  const salida = path.join(r.cache, `${claveIntro({ width, height, fps, momento })}-${timescale}-${audio.rate}-${audio.canales}.mp4`);
  if (await existe(salida)) return salida;
  const k = height / 1080;
  const introAss = path.join(r.cache, `${claveIntro({ width, height, fps, momento })}.ass`);
  await fs.writeFile(introAss, assIntro({ lineas: lineasIntro(momento), width, height }));
  const lado = Math.round(150 * k);
  const grafo = [
    `[0:v]trim=start=4:duration=${INTRO_SEG},setpts=PTS-STARTPTS,scale=${Math.round(width * 1.1)}:${Math.round(height * 1.1)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.1)}:${Math.round(height * 1.1)},zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`,
    `hue=s=0,format=rgb24,colorchannelmixer=rr=1.0:gg=0.85:bb=0.62,eq=contrast=0.93:brightness=0.09:gamma=1.15,format=gbrp,split[a][b]`,
  ].join(',') + `;[b]gblur=sigma=30[g];[a][g]blend=all_mode=screen:all_opacity=0.30,vignette=PI/5,`
    + `subtitles='${rutaFiltro(introAss)}':fontsdir='${rutaFiltro(path.dirname(r.cinzel))}'`
    + `,fade=t=in:st=0:d=0.5,fade=t=out:st=${INTRO_SEG - 0.4}:d=0.4:color=0x3a2a14[v];`
    + `[1:v]scale=${lado}:${lado},format=rgba,colorchannelmixer=aa=0.9[l];[v][l]overlay=W-w-${Math.round(40 * k)}:H-h-${Math.round(30 * k)},format=yuv420p,setsar=1[out];`
    + `[2:a]atrim=0:${INTRO_SEG},asetpts=PTS-STARTPTS,afade=t=in:d=1,afade=t=out:st=${INTRO_SEG - 1.2}:d=1.2,volume=-6dB,aformat=sample_rates=${audio.rate}:channel_layouts=${audio.canales === 1 ? 'mono' : 'stereo'}[au]`;
  const tmp = `${salida}.tmp.mp4`;
  await runFFmpeg(['-y', '-v', 'error', '-i', r.nubes, '-i', r.logo, '-i', r.musica, '-filter_complex', grafo,
    '-map', '[out]', '-map', '[au]', '-t', String(INTRO_SEG), '-r', String(fps), ...encode,
    '-c:a', 'aac', '-b:a', '192k', '-video_track_timescale', String(timescale), tmp]);
  await fs.rename(tmp, salida);
  return salida;
}

/** Glues the intro in front of the final video without re-encoding. Returns the seconds added (0 if none). */
async function pegaIntro({ dataRoot, finalPath, width, height, fps, momento, encode, logger = console }) {
  if (!marcaActiva()) return 0;
  const lista = `${finalPath}.intro.txt`;
  const unido = finalPath.replace(/\.mp4$/i, '_conintro.mp4');
  try {
    const cuerpo = await sondea(finalPath);
    if (!cuerpo.audio) throw new Error('the video has no audio');
    const introPath = await intro({ dataRoot, width, height, fps, momento, encode, timescale: cuerpo.timescale, audio: cuerpo.audio });
    const esc = p => `file '${p.replace(/'/g, "'\\''")}'`;
    await fs.writeFile(lista, `${esc(introPath)}\n${esc(finalPath)}\n`);
    await runFFmpeg(['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', '-movflags', '+faststart', unido]);
    const [i, u] = [await sondea(introPath), await sondea(unido)];
    if (!concatCuadra(i.duracion, cuerpo.duracion, u.duracion) || !u.audio) throw new Error(`the join does not add up (${i.duracion.toFixed(1)} + ${cuerpo.duracion.toFixed(1)} ≠ ${u.duracion.toFixed(1)})`);
    // The joint must decode without errors.
    const { stderr } = await runFFmpeg(['-v', 'error', '-ss', String(INTRO_SEG - 2), '-t', '4', '-i', unido, '-f', 'null', '-']);
    if (String(stderr || '').trim()) throw new Error(`the joint gives errors: ${String(stderr).slice(0, 120)}`);
    await fs.rename(unido, finalPath);
    logger.info?.(`Intro de marca pegada (${saludoDe(momento)}, +${i.duracion.toFixed(1)} s)`);
    return i.duracion;
  } catch (error) {
    logger.warn?.(`Brand intro not applied (${error.message}); the video goes out without an intro`);
    return 0;
  } finally {
    await Promise.all([fs.unlink(lista).catch(() => {}), fs.unlink(unido).catch(() => {})]);
  }
}

/** What timeline pass 3 needs, or null if branding is off or something is missing. */
let filtrosFfmpeg = null;
/** The container's ffmpeg-static doesn't have drawtext (02/10/2026): the texts go through libass. */
async function tieneFiltro(nombre) {
  if (!filtrosFfmpeg) {
    const { stdout } = await runFFmpeg(['-hide_banner', '-filters']);
    filtrosFfmpeg = String(stdout);
  }
  return new RegExp(`\\s${nombre}\\s`).test(filtrosFfmpeg);
}

/** PNG sequence of a «Video elements» card; generated once and kept in assets. */
async function secuenciaSvg(dir, segundos, svgDe, sharp = require('./safe-sharp')) {
  const n = Math.round(segundos * 30);
  if (await existe(path.join(dir, `f${String(n - 1).padStart(3, '0')}.png`))) return dir;
  await fs.mkdir(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    await sharp(Buffer.from(svgDe(i / 30))).png().toFile(path.join(dir, `f${String(i).padStart(3, '0')}.png`));
  }
  return dir;
}

/**
 * The body's animations per «Video elements» (the `video_extras` setting).
 * Without a duration (or without the setting) it stays as before: subscribe at 3 s.
 */
async function animacionesDelCuerpo({ r, extras, duracion }) {
  const { planDeExtras, normalizaExtras, DURACION } = require('./extras-video');
  const { svgCampana, svgComentar, svgCompartir } = require('./extras-video-svg');
  const e = normalizaExtras(extras);
  const plan = duracion ? planDeExtras({ extras: e, duracion }) : [{ tipo: 'suscribir', inicio: SUSCRIBIR_EN }];
  const dirs = {};
  const salida = [];
  for (const p of plan) {
    if (!dirs[p.tipo]) {
      if (p.tipo === 'suscribir') dirs[p.tipo] = await animacionSuscribir(r.suscribir);
      else if (p.tipo === 'campana') dirs[p.tipo] = await secuenciaSvg(path.join(r.extras, 'campana-v1'), DURACION.campana, svgCampana);
      else if (p.tipo === 'compartir') dirs[p.tipo] = await secuenciaSvg(path.join(r.extras, 'compartir-v1'), DURACION.compartir, svgCompartir);
      else {
        const clave = require('crypto').createHash('sha1').update(e.comentar.texto).digest('hex').slice(0, 10);
        dirs[p.tipo] = await secuenciaSvg(path.join(r.extras, `comentar-v1-${clave}`), DURACION.comentar, t => svgComentar(t, e.comentar.texto));
      }
    }
    salida.push({ tipo: p.tipo, inicio: p.inicio, secuencia: path.join(dirs[p.tipo], 'f%03d.png') });
  }
  return salida;
}

async function marcaCuerpo({ dataRoot, logger = console, extras = null, duracion = null }) {
  if (!marcaActiva()) return null;
  try {
    if (!(await tieneFiltro('subtitles'))) throw new Error('this ffmpeg has no subtitles filter');
    const r = rutas(dataRoot);
    for (const p of [r.logo, r.bebas]) if (!(await existe(p))) throw new Error(`missing ${path.basename(p)}`);
    await fs.mkdir(r.cache, { recursive: true });
    const nombreAss = path.join(r.cache, `nombre-${VERSION}.ass`);
    await fs.writeFile(nombreAss, assNombre({ nombre: nombreCanal() }));
    const animaciones = await animacionesDelCuerpo({ r, extras, duracion });
    if (animaciones.length) logger.info?.(`Video elements: ${animaciones.map(a => `${a.tipo}@${Math.round(a.inicio)}s`).join(', ')}`);
    return { logo: r.logo, nombreAss, fontsDir: path.dirname(r.bebas), animaciones };
  } catch (error) {
    logger.warn?.(`Body branding not applied (${error.message})`);
    return null;
  }
}

module.exports = { filtroShort, marcaShort, animacionesDelCuerpo, secuenciaSvg, assNombre, assIntro, assHora, saludoDe, marcaActiva, lineasIntro, filtroCuerpo, claveIntro, concatCuadra, escapaTexto, marcaCuerpo, pegaIntro, animacionSuscribir, INTRO_SEG };
