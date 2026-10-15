/**
 * El carrusel de oración convertido en vídeo con música (04/10/2026).
 *
 * el autor quiere música cristiana en las publicaciones. La API de Instagram NO
 * deja poner música a un carrusel de imágenes (eso solo se hace a mano en la
 * app) y una canción comercial subida dentro del vídeo la silencia Meta. Así
 * que el carrusel se monta como Reel 9:16 con música de licencia libre de
 * BACKGROUND_MUSIC_DIR (hoy: pianos de Kevin MacLeod, CC BY 4.0 → crédito
 * en el texto). Para otra música basta con dejar el .mp3 en esa carpeta.
 *
 * Tiempos: portada 4 s, cada oración el tiempo de leerla (10-15 s), cierre 5 s.
 * Total ≤ 89 s para que Facebook lo acepte como Reel.
 */
const fs = require('fs');
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');

const FUNDIDO = 0.7;
const MAX_SEGUNDOS = 89;
const AUDIO = /\.(mp3|m4a|wav)$/i;

/** Segundos en pantalla de cada diapositiva (portada, oraciones…, cierre). */
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

/** Crédito para el texto si la carpeta trae LICENCIA.md con una licencia CC BY. */
function creditoMusica(dir) {
  const licencia = path.join(dir || '', 'LICENCIA.md');
  if (!fs.existsSync(licencia)) return '';
  const texto = fs.readFileSync(licencia, 'utf8');
  if (!/CC BY|Creative Commons Attribution/i.test(texto)) return '';
  const autor = texto.split('\n')[0].split('—').slice(1).join('—').trim() || texto.split('\n')[0].trim();
  return `🎵 Música: ${autor} · CC BY 4.0`;
}

/** Argumentos de ffmpeg: imágenes con fundido + música con entrada y salida suaves. */
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
  if (tiempos.length !== imagenes.length) throw new Error('Vídeo del carrusel: no cuadran imágenes y tiempos');
  const musica = eligeMusica(musicaDir, semilla);
  const { args, total } = argumentosFFmpeg({ imagenes, tiempos, musica, salida });
  await fs.promises.mkdir(path.dirname(salida), { recursive: true });
  await ejecuta(args);
  if (musica && ejecuta === runFFmpeg) await require('./sonoridad').normalizaVideo(salida); // música a -14 LUFS
  return { ruta: salida, segundos: total, musica, credito: musica ? creditoMusica(musicaDir) : '' };
}

module.exports = { duraciones, eligeMusica, creditoMusica, argumentosFFmpeg, hazVideo, MAX_SEGUNDOS };
