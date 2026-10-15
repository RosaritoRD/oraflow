/**
 * Timeline renderer: storyboard shots (each with an asset, motion and
 * transition) → one visual track, with section title cards and burned-in
 * captions, at the exact length of the narration.
 *
 * Pass 1: every shot becomes a short clip (image → Ken Burns, video → cover
 *         crop) of its own duration plus the transition into the next shot.
 * Pass 2: clips are chained with xfade at the shot start times (so the audio
 *         never drifts), title cards are drawn, captions are burned in.
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const sharp = require('./safe-sharp');
const crypto = require('crypto');
const { runFFmpeg, getFFmpegPath } = require('./ffmpeg');
const prayerTheme = require('./prayer-theme');

const ENCODE = ['-c:v', 'libx264', '-preset', process.env.RENDER_PRESET || 'veryfast', '-crf', process.env.RENDER_CRF || '20', '-pix_fmt', 'yuv420p'];

function dims(storyboard) {
  const [w, h] = String(storyboard.resolution || '1920x1080').split('x').map(Number);
  return { width: w || 1920, height: h || 1080, fps: storyboard.fps || 30 };
}

function execText(cmd, args) {
  return new Promise(resolve => execFile(cmd, args, (error, stdout) => resolve(error ? '' : String(stdout))));
}

async function fontFile(preferred = ['Liberation Sans:bold', 'DejaVu Sans:bold', 'FreeSans:bold']) {
  for (const name of preferred) {
    const out = (await execText('fc-match', ['-f', '%{file}', name])).trim();
    if (out) return out;
  }
  return null;
}

async function probe(file) {
  const ffprobe = getFFmpegPath().replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
  for (const bin of [ffprobe, 'ffprobe']) {
    const out = await execText(bin, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames', '-of', 'json', file]);
    if (out) {
      try { return JSON.parse(out); } catch { /* try next */ }
    }
  }
  return null;
}

/** Ken Burns expression for a still. Input is upscaled first so steps are sub-pixel smooth. */
function motionFilter(type, frames, width, height) {
  const zoomMax = 1.07;
  const up = { w: Math.round(width * 1.5), h: Math.round(height * 1.5) };
  const base = `scale=${up.w}:${up.h}:force_original_aspect_ratio=increase,crop=${up.w}:${up.h}`;
  const centerX = 'iw/2-(iw/zoom/2)';
  const centerY = 'ih/2-(ih/zoom/2)';
  const progress = `on/${Math.max(1, frames)}`;
  const variants = {
    'zoom-in': { z: `1+${(zoomMax - 1).toFixed(3)}*${progress}`, x: centerX, y: centerY },
    'zoom-out': { z: `${zoomMax}-${(zoomMax - 1).toFixed(3)}*${progress}`, x: centerX, y: centerY },
    'pan-left': { z: `${zoomMax}`, x: `(iw-iw/zoom)*(1-${progress})`, y: centerY },
    'pan-right': { z: `${zoomMax}`, x: `(iw-iw/zoom)*${progress}`, y: centerY },
    none: { z: '1', x: centerX, y: centerY }
  };
  const v = variants[type] || variants['zoom-in'];
  return `${base},zoompan=z='${v.z}':x='${v.x}':y='${v.y}':d=1:s=${width}x${height}:fps=30`;
}

const TONO = {
  calido: 'colorbalance=rs=0.06:gs=0.02:bs=-0.06',
  frio: 'colorbalance=rs=-0.05:gs=0.01:bs=0.06',
  suave: 'eq=saturation=0.85:contrast=0.95:brightness=0.02'
};

/**
 * Filtro de un clip de VÍDEO reutilizado (utils/biblioteca-stock.js elegirVariante):
 * velocidad, espejo, tono y un movimiento suave de cámara. Sin variante, el clip
 * va tal cual, como siempre.
 */
function filtroVariante(v, { width, height, fps, frames, fuenteFps = null }) {
  // 06/10/2026: un clip de 24/25 fps pasado a 30 con fps= repite fotogramas y el
  // movimiento da tirones; framerate= los mezcla y queda fluido (solo cuando hace falta).
  const cadencia = fuenteFps && fuenteFps < fps - 1 && fps / fuenteFps < 1.6
    ? `framerate=fps=${fps}:interp_start=0:interp_end=255:scene=100`
    : `fps=${fps}`;
  const base = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},${cadencia}`;
  if (!v) return base;
  const partes = [];
  if (v.velocidad && v.velocidad !== 1) partes.push(`setpts=PTS/${v.velocidad}`);
  partes.push(base);
  if (v.espejo) partes.push('hflip');
  if (TONO[v.tono]) partes.push(TONO[v.tono]);
  if (v.movimiento && v.movimiento !== 'none') {
    // Mismo Ken Burns que las fotos, pero sin la sobre-escala x1.5 (el vídeo ya se mueve).
    const z = 1.08;
    const avance = `on/${Math.max(1, frames)}`;
    const cx = 'iw/2-(iw/zoom/2)', cy = 'ih/2-(ih/zoom/2)';
    const m = {
      'zoom-in': [`1+${(z - 1).toFixed(3)}*${avance}`, cx, cy],
      'zoom-out': [`${z}-${(z - 1).toFixed(3)}*${avance}`, cx, cy],
      'pan-left': [`${z}`, `(iw-iw/zoom)*(1-${avance})`, cy],
      'pan-right': [`${z}`, `(iw-iw/zoom)*${avance}`, cy]
    }[v.movimiento];
    if (m) partes.push(`zoompan=z='${m[0]}':x='${m[1]}':y='${m[2]}':d=1:s=${width}x${height}:fps=${fps}`);
  }
  return partes.join(',');
}

/** Placeholder still when no asset could be found: warm gradient with the visual intent as a hint (no text burned). */
async function placeholderStill(index, outPath, width, height) {
  const [top, mid, bottom] = prayerTheme.PALETTES[index % prayerTheme.PALETTES.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="0.55" stop-color="${mid}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="url(#g)"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  return outPath;
}

/**
 * Caché de planos: la clave es todo lo que afecta al píxel (archivo de origen,
 * duración, movimiento, tamaño). Cambiar UNA escena rehacía los 31 planos —
 * 20 minutos de CPU para recrear clips idénticos. Con esto, solo se renderiza
 * lo que cambió.
 */
function claveDePlano(shot, index, { width, height, fps }, nextTransition) {
  const asset = shot.selectedAsset?.localPath || `placeholder_${index}`;
  let sello = '';
  try {
    const st = require('fs').statSync(asset);
    sello = `${st.size}:${Math.round(st.mtimeMs)}`;
  } catch { sello = 'sin-archivo'; }
  const partes = [asset, sello, shot.duration, nextTransition?.duration || 0,
    shot.visualMotion?.type || 'zoom-in', width, height, fps,
    ENCODE.join(','), index % prayerTheme.PALETTES.length, shot.variante ? JSON.stringify(shot.variante) : ''];
  return crypto.createHash('sha1').update(partes.join('|')).digest('hex').slice(0, 20);
}

async function renderShotClip(shot, index, { width, height, fps }, workDir, nextTransition) {
  const length = shot.duration + (nextTransition?.duration || 0);
  const frames = Math.round(length * fps);
  const out = path.join(workDir, `shot_${String(index).padStart(3, '0')}.mp4`);
  const asset = shot.selectedAsset?.localPath || null;
  const isVideo = asset && /\.(mp4|mov|webm|m4v)$/i.test(asset);
  const args = ['-y'];
  let filter;
  const v = shot.variante || null;
  if (isVideo) {
    // Reutilizado: empieza en otra parte del clip (inicio = fracción de lo que sobra).
    const sobra = Math.max(0, (Number(shot.selectedAsset?.durationSec) || 0) - length * (v?.velocidad || 1));
    const desde = v?.inicio ? v.inicio * sobra : 0;
    if (desde > 0.5) args.push('-ss', desde.toFixed(2));
    args.push('-stream_loop', '-1', '-i', asset);
    const info = await probe(asset).catch(() => null);
    const [num, den] = String(info?.streams?.find(st => st.codec_type === 'video')?.r_frame_rate || '').split('/').map(Number);
    const fuenteFps = num && den ? num / den : null;
    filter = `[0:v]${filtroVariante(v, { width, height, fps, frames, fuenteFps })}`;
  } else {
    const still = asset || await placeholderStill(index, path.join(workDir, `placeholder_${index}.png`), width, height);
    args.push('-loop', '1', '-framerate', String(fps), '-t', length.toFixed(3), '-i', still);
    filter = `[0:v]${motionFilter(shot.visualMotion?.type || 'zoom-in', frames, width, height)}`;
    if (v?.espejo) filter += ',hflip';
    if (TONO[v?.tono]) filter += `,${TONO[v.tono]}`;
  }
  filter += `,trim=duration=${length.toFixed(3)},setpts=PTS-STARTPTS,settb=AVTB,format=yuv420p[v]`;
  args.push('-filter_complex', filter, '-map', '[v]', '-an', '-r', String(fps), ...ENCODE, '-t', length.toFixed(3), out);
  await runFFmpeg(args);
  return out;
}

function xfadeName(type) {
  return { cut: 'fade', crossfade: 'fade', fade: 'fadeblack' }[type] || 'fade';
}

/** Section starts → { start, end, title } for the ASS title style. */
function titleCards(storyboard, seconds = 2.5) {
  return (storyboard?.scenes || [])
    .filter(scene => scene.sectionStart && scene.sectionTitle && scene.shots?.length)
    .map(scene => ({ start: scene.shots[0].start, end: Math.min(scene.shots[0].start + seconds, scene.audioEnd), title: scene.sectionTitle }));
}

/** La caché no puede crecer sin freno: 400 planos o 7 días, lo que llegue antes. */
async function podaCache(cacheDir, logger = console, maximo = 400, dias = 7) {
  try {
    const nombres = await fs.readdir(cacheDir);
    const limite = Date.now() - dias * 86400000;
    const fichas = [];
    for (const nombre of nombres) {
      const ruta = path.join(cacheDir, nombre);
      const st = await fs.stat(ruta).catch(() => null);
      if (st) fichas.push({ ruta, usado: st.mtimeMs });
    }
    fichas.sort((a, b) => b.usado - a.usado);
    const sobran = fichas.filter((f, i) => i >= maximo || f.usado < limite);
    for (const f of sobran) await fs.unlink(f.ruta).catch(() => {});
    if (sobran.length) logger.info?.(`Caché de planos: ${sobran.length} clips viejos borrados`);
  } catch { /* la caché es un extra: si falla, no rompe el render */ }
}

async function withConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next; next += 1;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/**
 * Render the visual track.
 * @returns {{ videoPath, shots: number, durationSec }}
 */
async function renderTimeline(storyboard, { outputPath, captionsAssPath = null, workDir = null, logger = console, concurrency = 2, marca = null } = {}) {
  const { width, height, fps } = dims(storyboard);
  const shots = storyboard.scenes.flatMap(scene => scene.shots.map(shot => ({ ...shot, sectionStart: scene.sectionStart && shot.order === 0, sectionTitle: scene.sectionTitle })));
  if (!shots.length) throw new Error('Storyboard has no shots to render');
  const dir = workDir || await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-'));
  await fs.mkdir(dir, { recursive: true });

  const cacheDir = path.join(path.dirname(dir), 'shot-cache');
  await fs.mkdir(cacheDir, { recursive: true });
  let reutilizados = 0;
  const clips = await withConcurrency(shots, Math.max(1, concurrency), async (shot, i) => {
    const clave = claveDePlano(shot, i, { width, height, fps }, shots[i + 1]?.transition);
    const cacheado = path.join(cacheDir, `${clave}.mp4`);
    if (await fs.stat(cacheado).then(st => st.size > 1000).catch(() => false)) {
      await fs.utimes(cacheado, new Date(), new Date()).catch(() => {});   // marca de uso
      reutilizados += 1;
      return cacheado;
    }
    const salida = await renderShotClip(shot, i, { width, height, fps }, dir, shots[i + 1]?.transition);
    await fs.copyFile(salida, cacheado).catch(() => {});
    return salida;
  });
  logger.info?.(`Rendering ${shots.length} shots (${width}x${height}@${fps})... ${reutilizados} reutilizados de la caché, ${shots.length - reutilizados} nuevos`);
  await podaCache(cacheDir, logger);

  // Pass 2: chain in batches. One xfade chain over 100+ inputs opens 100+
  // decoders at once and gets OOM-killed inside a 2 GB container, so shots are
  // joined in groups (boundaries fall on hard cuts where possible), each group
  // trimmed to its exact length, then the groups are concatenated losslessly.
  const batchSize = Math.max(4, Number(process.env.RENDER_BATCH_SHOTS) || 12);
  const batches = [];
  let current = [];
  shots.forEach((shot, i) => {
    const boundaryOk = i > 0 && (shot.transition?.type || 'cut') === 'cut';
    if (current.length >= batchSize && (boundaryOk || current.length >= batchSize + 4)) { batches.push(current); current = []; }
    current.push(i);
  });
  if (current.length) batches.push(current);

  const segments = [];
  for (const [b, indexes] of batches.entries()) {
    const segmentPath = path.join(dir, `segment_${String(b).padStart(3, '0')}.mp4`);
    const length = indexes.reduce((sum, i) => sum + shots[i].duration, 0);
    const args = ['-y'];
    for (const i of indexes) args.push('-i', clips[i]);
    const filters = [];
    let prev = '[0:v]';
    let clock = 0; // offset inside this segment
    for (let k = 1; k < indexes.length; k += 1) {
      const shot = shots[indexes[k]];
      const t = shot.transition || { type: 'cut', duration: 0.05 };
      const duration = Math.max(0.04, Math.min(Number(t.duration) || 0.05, shots[indexes[k - 1]].duration));
      clock += shots[indexes[k - 1]].duration;
      const out = k === indexes.length - 1 ? '[chain]' : `[x${k}]`;
      filters.push(`${prev}[${k}:v]xfade=transition=${xfadeName(t.type)}:duration=${duration.toFixed(3)}:offset=${clock.toFixed(3)}${out}`);
      prev = out;
    }
    if (indexes.length === 1) filters.push('[0:v]null[chain]');
    args.push('-filter_complex', filters.join(';'), '-map', '[chain]', '-an', '-r', String(fps), '-t', length.toFixed(3), ...ENCODE, segmentPath);
    await runFFmpeg(args);
    segments.push(segmentPath);
    logger.info?.(`Timeline segment ${b + 1}/${batches.length} rendered (${indexes.length} shots)`);
  }

  // Pass 3: concat the segments (demuxer, no re-decode of inputs beyond the
  // one encode) and burn captions + title/verse cards in the same pass.
  const listPath = path.join(dir, 'segments.txt');
  await fs.writeFile(listPath, segments.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
  const cards = titleCards(storyboard);
  const finalArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath];
  if (marca && marca.short) {
    // Short (03/10/2026): solo la animación de suscribirse, recortada y en vertical.
    const { filtroShort } = require('./marca-video');
    for (const a of marca.animaciones) finalArgs.push('-framerate', String(fps), '-i', a.secuencia);
    finalArgs.push('-filter_complex', filtroShort({ assPath: captionsAssPath, animaciones: marca.animaciones, width, height }), '-map', '[vout]');
  } else if (marca) {
    // Marca del canal (utils/marca-video.js): nombre, logo y animación de suscribirse,
    // quemados junto con los subtítulos en esta misma pasada.
    const { filtroCuerpo } = require('./marca-video');
    // Una entrada por animación de «Elementos del vídeo» (utils/extras-video.js).
    const animaciones = Array.isArray(marca.animaciones) ? marca.animaciones
      : [{ secuencia: marca.secuencia, inicio: marca.inicioSuscribir }];
    finalArgs.push('-i', marca.logo);
    for (const a of animaciones) finalArgs.push('-framerate', String(fps), '-i', a.secuencia);
    finalArgs.push('-filter_complex', filtroCuerpo({ assPath: captionsAssPath, nombreAss: marca.nombreAss, fontsDir: marca.fontsDir, animaciones, width }),
      '-map', '[vout]');
  } else if (captionsAssPath) finalArgs.push('-vf', `subtitles='${captionsAssPath.replace(/'/g, "\\'").replace(/:/g, '\\:')}'`);
  finalArgs.push('-an', '-r', String(fps), ...ENCODE, outputPath);
  await runFFmpeg(finalArgs);

  const info = await probe(outputPath);
  const durationSec = Number(info?.format?.duration) || 0;
  return { videoPath: outputPath, shots: shots.length, durationSec, workDir: dir, titleCards: cards.length };
}

module.exports = { ENCODE, renderTimeline, renderShotClip, motionFilter, filtroVariante, titleCards, claveDePlano, podaCache, probe, fontFile, dims, withConcurrency };
