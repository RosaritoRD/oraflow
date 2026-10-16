/**
 * Shorts cover (02/10/2026, the owner's images in data/assets/portadas-short/).
 * YouTube doesn't allow uploading a custom thumbnail for a Short: it takes a
 * frame. So the cover goes INSIDE the video, as the first shot
 * (SHORT_COVER_SECONDS, 1.5 s by default) with the title on top, and blends into
 * the rest while the voice starts.
 *
 * The images are 9:16 with clear sky at the top and the logo (the cross) top
 * center; the logo is painted again in that same spot so it stays sharp and so the
 * one that doesn't have it gets it too.
 */
const fs = require('fs').promises;
const path = require('path');
const { runFFmpeg } = require('./ffmpeg');
const { titular, reparteTitular, etiquetaFormato } = require('./miniatura-oracion');

const W = 1080;
const H = 1920;
const EXT = /\.(jpe?g|png|webp)$/i;
// Where the owner's images carry the logo (941x1672 → 1080x1920): center and diameter.
const LOGO = { cx: 540, cy: 138, d: 128 };

function carpetaPortadas() {
  return process.env.PORTADAS_SHORT_DIR || path.join(__dirname, '..', 'data', 'assets', 'portadas-short');
}

/**
 * Seconds the cover shows INSIDE the video. 11/10/2026 (the owner): 0 by
 * default — the Short starts talking and the cover is set by hand from
 * /portadas. SHORT_COVER_SECONDS=1.5 glues it in again. Max 3 s.
 */
function segundosPortada(env = process.env) {
  const raw = String(env.SHORT_COVER_SECONDS ?? '').trim().toLowerCase();
  if (raw === 'off' || raw === '') return 0;
  const v = Number(raw);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(3, v));
}

/** The least used one (without repeating the last). State in the folder's _rotacion.json. */
async function eligePortada({ raiz = carpetaPortadas(), logger = console } = {}) {
  const nombres = (await fs.readdir(raiz).catch(() => [])).filter(n => EXT.test(n)).sort();
  if (!nombres.length) return null;
  const rutaEstado = path.join(raiz, '_rotacion.json');
  let estado = {};
  try { estado = JSON.parse(await fs.readFile(rutaEstado, 'utf8')); } catch { estado = {}; }
  const candidatos = nombres.filter(n => nombres.length === 1 || n !== estado._ultimo);
  candidatos.sort((a, b) => ((estado[a]?.usos || 0) - (estado[b]?.usos || 0))
    || String(estado[a]?.en || '').localeCompare(String(estado[b]?.en || '')) || a.localeCompare(b));
  const nombre = candidatos[0];
  estado[nombre] = { usos: (estado[nombre]?.usos || 0) + 1, en: new Date().toISOString() };
  estado._ultimo = nombre;
  await fs.writeFile(rutaEstado, JSON.stringify(estado, null, 1)).catch(() => {});
  logger.info?.(`Short cover: ${nombre}`);
  return path.join(raiz, nombre);
}

const escapa = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Liberation Sans Bold in capitals ≈ 0.68 em per letter.
// 03/10/2026: Oswald Bold (condensed) in capitals ≈ 0.52 em per letter.
const cuerpoQueCabe = (texto, maximo, ancho) => Math.min(maximo, Math.floor(ancho / (Math.max(1, texto.length) * 0.52)));

function portadaSvg({ lineas, dorada, etiqueta, logo }) {
  const piezas = [];
  let y = 330;
  piezas.push(`<text x="${W / 2}" y="${y}" class="etiqueta">${escapa(etiqueta)}</text>`);
  y += 40;
  lineas.forEach((linea, i) => {
    const oro = i === dorada;
    // 03/10/2026 (the owner): bigger letters (before 120/96 at 960 px).
    const cuerpo = cuerpoQueCabe(linea, oro ? 190 : 160, 960);
    y += Math.round(cuerpo * 1.02);
    piezas.push(`<text x="${W / 2}" y="${y}" class="${oro ? 'oro' : 'blanco'}" font-size="${cuerpo}">${escapa(linea)}</text>`);
  });
  const r = LOGO.d / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sombra" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050308" stop-opacity="0.55"/>
      <stop offset="40%" stop-color="#050308" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="#050308" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="circulo"><circle cx="${LOGO.cx}" cy="${LOGO.cy}" r="${r}"/></clipPath>
    <filter id="borde" x="-5%" y="-20%" width="110%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.85"/>
    </filter>
    <style>
      text { font-family: 'Oswald', 'Liberation Sans Narrow', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif; font-weight: 700; text-anchor: middle; filter: url(#borde); paint-order: stroke; stroke: #000; stroke-width: 6; stroke-linejoin: round; }
      .blanco { fill: #FFFFFF; }
      .oro { fill: #F5C63C; }
      .etiqueta { fill: #FFE3A3; font-size: 46px; letter-spacing: 7px; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sombra)"/>
  ${logo ? `<image href="${logo}" x="${LOGO.cx - r}" y="${LOGO.cy - r}" width="${LOGO.d}" height="${LOGO.d}" clip-path="url(#circulo)" preserveAspectRatio="xMidYMid slice"/>` : ''}
  ${piezas.join('\n  ')}
</svg>`;
}

/** No emojis or the reference in parentheses: in big letters they clutter the headline. */
function tituloDePortada(titulo = '') {
  return String(titulo)
    .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
    .replace(/\s*\((?:[^()]*\d+:\d+[^()]*)\)/g, '')
    .replace(/\s+/g, ' ').trim();
}

/** 1080x1920 cover: the image + label (morning/night) + headline + logo. */
async function componePortadaShort({ sharp, fondo, logoPath = null, titulo = '', topic = '', salida }) {
  const { lineas, dorada } = reparteTitular(titular({ topic, title: tituloDePortada(titulo) }));
  const logo = logoPath
    ? `data:image/png;base64,${(await sharp(logoPath).resize(256, 256).png().toBuffer()).toString('base64')}`
    : null;
  const svg = portadaSvg({ lineas, dorada, etiqueta: etiquetaFormato(topic, titulo), logo });
  await sharp(fondo).resize(W, H, { fit: 'cover' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 92 }).toFile(salida);
  return salida;
}

/**
 * Lays the cover over the video's first `segundos` (no audio, called before mixing the voice)
 * and fades it. The video keeps the same duration.
 */
async function aplicaPortada({ video, portada, segundos = segundosPortada(), logger = console }) {
  if (!segundos) return video;
  const fundido = Math.min(0.5, segundos / 3);
  const tmp = video.replace(/\.mp4$/i, '_portada.mp4');
  await runFFmpeg(['-y', '-i', video, '-loop', '1', '-t', String(segundos), '-i', portada,
    '-filter_complex',
    `[1:v]scale=${W}:${H},format=rgba,fade=t=out:st=${(segundos - fundido).toFixed(2)}:d=${fundido.toFixed(2)}:alpha=1[p];` +
    `[0:v][p]overlay=0:0:eof_action=pass:shortest=0[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', tmp]);
  await fs.rename(tmp, video);
  logger.info?.(`Cover laid over the Short's first ${segundos}s`);
  return video;
}

module.exports = { tituloDePortada, eligePortada, componePortadaShort, aplicaPortada, segundosPortada, carpetaPortadas, portadaSvg };
