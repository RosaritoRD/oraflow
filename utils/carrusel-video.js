/**
 * The prayer carousel turned into a video with music (04/10/2026).
 *
 * The owner wants Christian music on the posts. The Instagram API does NOT allow
 * adding music to an image carousel (that's only done by hand in the app) and Meta
 * mutes a commercial song uploaded inside the video. So the carousel is assembled
 * as a 9:16 Reel with freely licensed music from BACKGROUND_MUSIC_DIR (today:
 * Kevin MacLeod pianos, CC BY 4.0 → credit in the text). For other music, just
 * drop the .mp3 in that folder.
 *
 * Timings: cover 4 s, each prayer the time it takes to read it (10-15 s), closing
 * 5 s.
 * Total ≤ 89 s so Facebook accepts it as a Reel.
 */
const fs = require('fs');
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');

const FUNDIDO = 0.7;
const MAX_SEGUNDOS = 89;
const AUDIO = /\.(mp3|m4a|wav)$/i;

/** Seconds on screen for each slide (cover, prayers…, closing). */
function duraciones(datos) {
  const oraciones = datos.oraciones.map(o => {
    const palabras = `${o.texto} ${o.versiculo?.texto || ''}`.split(/\s+/).length;
    return Math.min(15, Math.max(10, Math.round(palabras / 4.5)));
  });
  const lista = [4, ...oraciones, 5];
  const total = lista.reduce((a, b) => a + b, 0) - FUNDIDO * (lista.length - 1);
  if (total <= MAX_SEGUNDOS) return lista;
  const factor = MAX_SEGUNDOS / total;
  return lista.map(d => Math.max(3, Math.floor(d * factor * 10) / 10));
}

function eligeMusica(dir, semilla = Date.now()) {
  const pistas = fs.existsSync(dir || '') ? fs.readdirSync(dir).filter(f => AUDIO.test(f)).sort() : [];
  if (!pistas.length) return null;
  return path.join(dir, pistas[Math.floor(semilla / 86400000) % pistas.length]);
}

/** Credit for the text if the folder carries a LICENCIA.md with a CC BY license. */
function creditoMusica(dir) {
  const licencia = path.join(dir || '', 'LICENCIA.md');
  if (!fs.existsSync(licencia)) return '';
  const texto = fs.readFileSync(licencia, 'utf8');
  if (!/CC BY|Creative Commons Attribution/i.test(texto)) return '';
  const autor = texto.split('\n')[0].split('—').slice(1).join('—').trim() || texto.split('\n')[0].trim();
  return `🎵 Música: ${autor} · CC BY 4.0`;
}

/** ffmpeg arguments: images with crossfades + music with soft fade in and out. */
function argumentosFFmpeg({ imagenes, tiempos, musica, salida }) {
  const args = ['-y'];
  imagenes.forEach((img, i) => args.push('-loop', '1', '-t', String(tiempos[i]), '-i', img));
  const total = tiempos.reduce((a, b) => a + b, 0) - FUNDIDO * (imagenes.length - 1);
  const filtros = imagenes.map((_, i) => `[${i}:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[s${i}]`);
  let previa = 's0';
  let desplazamiento = 0;
  for (let i = 1; i < imagenes.length; i += 1) {
    desplazamiento += tiempos[i - 1] - FUNDIDO;
    const sale = i === imagenes.length - 1 ? 'v' : `x${i}`;
    filtros.push(`[${previa}][s${i}]xfade=transition=fade:duration=${FUNDIDO}:offset=${desplazamiento.toFixed(2)}[${sale}]`);
    previa = sale;
  }
  if (imagenes.length === 1) filtros.push('[s0]copy[v]');
  const mapa = ['-map', '[v]'];
  if (musica) {
    args.push('-stream_loop', '-1', '-i', musica);
    filtros.push(`[${imagenes.length}:a]atrim=0:${total.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.8,afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5,aresample=48000[a]`);
    mapa.push('-map', '[a]');
  }
  args.push('-filter_complex', filtros.join(';'), ...mapa,
    '-t', total.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    ...(musica ? ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'] : []),
    '-movflags', '+faststart', salida);
  return { args, total };
}

async function hazVideo({ imagenes, datos, musicaDir = process.env.BACKGROUND_MUSIC_DIR, salida, semilla, ejecuta = runFFmpeg }) {
  const tiempos = duraciones(datos);
  if (tiempos.length !== imagenes.length) throw new Error('Carousel video: images and timings do not match');
  const musica = eligeMusica(musicaDir, semilla);
  const { args, total } = argumentosFFmpeg({ imagenes, tiempos, musica, salida });
  await fs.promises.mkdir(path.dirname(salida), { recursive: true });
  await ejecuta(args);
  if (musica && ejecuta === runFFmpeg) await require('./sonoridad').normalizaVideo(salida); // music at -14 LUFS
  return { ruta: salida, segundos: total, musica, credito: musica ? creditoMusica(musicaDir) : '' };
}

module.exports = { duraciones, eligeMusica, creditoMusica, argumentosFFmpeg, hazVideo, MAX_SEGUNDOS };
