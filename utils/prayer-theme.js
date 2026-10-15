/**
 * "prayer" channel theme — calm visuals for spoken-prayer channels.
 *
 * Enabled with CHANNEL_THEME=prayer. Replaces the generic purple slideshow and
 * the "MUST WATCH" thumbnail with warm dawn backgrounds, a serif title and no
 * on-screen bullet text. Real photos win over generated gradients:
 *   BACKGROUNDS_DIR      folder of .jpg/.png used as slide/thumbnail backgrounds
 *   BACKGROUND_MUSIC_DIR folder of .mp3/.m4a/.wav mixed quietly under the voice
 *   BACKGROUND_MUSIC_DB  music gain in dB (default -18)
 */
const fs = require('fs').promises;
const path = require('path');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.wav', '.aac', '.ogg']);

// Warm dawn palettes: [top, middle, bottom, glow]
const PALETTES = [
  ['#2b1d3a', '#7a3b5e', '#e8a06c', '#ffd9a0'],
  ['#1c2541', '#3a506b', '#c98e5a', '#ffe1b3'],
  ['#3a1c35', '#8c4a5a', '#f2b47e', '#fff0c9'],
  ['#14213d', '#4a4e69', '#d8a47f', '#ffe8c2'],
  ['#2e1f27', '#7d4f50', '#e6b89c', '#fff1d6'],
  ['#1f2a44', '#5b6c8f', '#cfa37a', '#ffe9c4']
];

function isEnabled() {
  return String(process.env.CHANNEL_THEME || '').toLowerCase() === 'prayer';
}

async function listFiles(dir, extensions) {
  if (!dir) return [];
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter(name => extensions.has(path.extname(name).toLowerCase()))
      .sort()
      .map(name => path.join(dir, name));
  } catch {
    return [];
  }
}

async function listBackgrounds() {
  return listFiles(process.env.BACKGROUNDS_DIR, IMAGE_EXT);
}

async function listMusic() {
  return listFiles(process.env.BACKGROUND_MUSIC_DIR, AUDIO_EXT);
}

function pickMusic(files, seed = Date.now()) {
  if (!files.length) return null;
  return files[Math.abs(seed) % files.length];
}

function musicGainDb() {
  const value = Number(process.env.BACKGROUND_MUSIC_DB);
  return Number.isFinite(value) ? Math.max(-40, Math.min(0, value)) : -18;
}

/*
 * Volumen del piano por formato (02/10/2026, el autor: «un poquito más fuerte» en
 * las oraciones; en los Shorts «en algunos, no en todos»).
 *   BACKGROUND_MUSIC_DB           base (Shorts normales)
 *   BACKGROUND_MUSIC_DB_LONG      largos (por defecto base + 3)
 *   BACKGROUND_MUSIC_DB_SHORT_LOUD Shorts «altos» (por defecto base + 3)
 *   SHORT_MUSIC_LOUD_PCT          % de Shorts altos (por defecto 40)
 * Qué Short va alto lo decide el id del vídeo: un reintento suena igual.
 */
function musicGainFor({ formato = null, semilla = '', env = process.env } = {}) {
  const limita = v => Math.max(-40, Math.min(0, v));
  const num = (v, fallback) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);
  const base = limita(num(env.BACKGROUND_MUSIC_DB, -18));
  if (formato === 'long') return limita(num(env.BACKGROUND_MUSIC_DB_LONG, base + 3));
  if (formato === 'short') {
    const pct = Math.max(0, Math.min(100, num(env.SHORT_MUSIC_LOUD_PCT, 40)));
    const cubeta = require('crypto').createHash('md5').update(String(semilla)).digest().readUInt32LE(0) % 100;
    return cubeta < pct ? limita(num(env.BACKGROUND_MUSIC_DB_SHORT_LOUD, base + 3)) : base;
  }
  return base;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// "Empieza tu día en paz | Oración de la Mañana" -> { main, tag }
function splitTitle(title) {
  const raw = String(title || '').trim();
  const parts = raw.split(/\s*[|—–-]\s*(?=Oraci[oó]n|Prayer)/i);
  if (parts.length >= 2) return { main: parts[0].trim(), tag: parts.slice(1).join(' ').trim() };
  return { main: raw, tag: '' };
}

function wrapWords(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function backgroundCss(index, imageDataUrl) {
  const [top, mid, bottom, glow] = PALETTES[index % PALETTES.length];
  const layers = [
    `radial-gradient(ellipse 70% 55% at 50% 78%, ${glow}cc 0%, ${glow}33 35%, transparent 70%)`,
    `linear-gradient(180deg, ${top} 0%, ${mid} 55%, ${bottom} 100%)`
  ];
  if (imageDataUrl) {
    return `background: linear-gradient(180deg, rgba(20,12,24,0.35) 0%, rgba(20,12,24,0.55) 100%), url("${imageDataUrl}") center / cover no-repeat;`;
  }
  return `background: ${layers.join(', ')};`;
}

/**
 * Slides: title card, one calm card per section (section title only, small),
 * closing card with the CTA. No bullets, no "subscribe" banner, no particles.
 * `images` are data URLs (already filtered/embedded by the caller).
 */
function slideshowHtml(script, images = [], options = {}) {
  const { main, tag } = splitTitle(script.title);
  const channel = escapeHtml(options.channelName || process.env.CHANNEL_NAME || '');
  const closing = escapeHtml(options.closingText || script.callToAction?.subscribe || 'Vuelve mañana por otra oración.');
  const sections = Array.isArray(script.mainContent?.sections) ? script.mainContent.sections : [];
  const imageAt = i => (images.length ? images[i % images.length] : null);

  const cards = [];
  cards.push(`
    <div class="slide active" style="${backgroundCss(0, imageAt(0))}">
      <div class="vignette"></div>
      <div class="content">
        <div class="tag">${escapeHtml(tag || channel)}</div>
        <h1>${escapeHtml(main)}</h1>
      </div>
    </div>`);

  sections.forEach((section, index) => {
    cards.push(`
    <div class="slide" style="${backgroundCss(index + 1, imageAt(index + 1))}">
      <div class="vignette"></div>
      <div class="content">
        <h2>${escapeHtml(section.title || '')}</h2>
      </div>
    </div>`);
  });

  cards.push(`
    <div class="slide" style="${backgroundCss(sections.length + 1, imageAt(sections.length + 1))}">
      <div class="vignette"></div>
      <div class="content">
        <div class="tag">${channel}</div>
        <h2>${closing}</h2>
      </div>
    </div>`);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #1a1220;
         font-family: 'Bitstream Charter', 'Liberation Serif', 'FreeSerif', Georgia, serif; }
  .slide { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; }
  .slide.active { opacity: 1; }
  .vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.45) 100%); }
  .content { position: relative; text-align: center; max-width: 72%; color: #fff7ea; }
  .tag { font-size: 34px; letter-spacing: 6px; text-transform: uppercase; opacity: 0.85; margin-bottom: 28px; }
  h1 { font-size: 88px; font-weight: 400; line-height: 1.15; margin: 0; text-shadow: 0 4px 24px rgba(0,0,0,0.45); }
  h2 { font-size: 64px; font-weight: 400; line-height: 1.2; margin: 0; text-shadow: 0 4px 24px rgba(0,0,0,0.45); }
</style></head><body>${cards.join('')}</body></html>`;
}

/**
 * Miniatura estilo "oración" tal y como la usan los canales que funcionan en
 * español (medido sobre 6 canales con 350k-104M visitas): texto ENORME en
 * amarillo dorado con borde negro grueso, en mayúsculas, sobre foto de
 * naturaleza. Nada de serif elegante: en el móvil, dentro de una parrilla de
 * miniaturas, gana el contraste, no el buen gusto.
 *
 * Con `date` escribe la fecha en grande, que es el formato de la oración
 * diaria — la gente busca "oración de hoy" todos los días.
 */
function thumbnailLoudSvg(title, options = {}) {
  const { width = 1280, height = 720, imageHref = null, date = null, paletteIndex = 0 } = options;
  const [top, mid, bottom, glow] = PALETTES[paletteIndex % PALETTES.length];
  const { main, tag } = splitTitle(title);
  const cabecera = (tag || process.env.CHANNEL_NAME || 'ORACIÓN DE LA MAÑANA').toUpperCase();
  const lineas = wrapWords(main.toUpperCase(), 18).slice(0, 3);

  const fondo = imageHref
    ? `<image href="${imageHref}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="${width}" height="${height}" fill="rgba(10,6,14,0.34)"/>`
    : `<rect width="${width}" height="${height}" fill="url(#cielo)"/>
       <ellipse cx="${width / 2}" cy="${height * 0.85}" rx="${width * 0.42}" ry="${height * 0.42}" fill="url(#sol)"/>`;

  // El bloque de texto se centra verticalmente contando cabecera + líneas + fecha.
  const alturaCabecera = Math.round(height * 0.115);
  const alturaLinea = Math.round(height * 0.145);
  const alturaFecha = date ? Math.round(height * 0.105) : 0;
  const totalTexto = alturaCabecera + lineas.length * alturaLinea + alturaFecha;
  let y = Math.round((height - totalTexto) / 2 + alturaCabecera * 0.85);

  const piezas = [`<text x="${width / 2}" y="${y}" class="cab">${escapeHtml(cabecera)}</text>`];
  for (const linea of lineas) {
    y += alturaLinea;
    piezas.push(`<text x="${width / 2}" y="${y}" class="gordo">${escapeHtml(linea)}</text>`);
  }
  if (date) {
    y += alturaFecha;
    piezas.push(`<text x="${width / 2}" y="${y}" class="fecha">${escapeHtml(String(date).toUpperCase())}</text>`);
  }

  const cuerpo = Math.round(height * 0.115);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="cielo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${top}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${bottom}"/>
    </linearGradient>
    <radialGradient id="sol" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.9"/><stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFE9A8"/><stop offset="45%" stop-color="#FFC529"/><stop offset="100%" stop-color="#F09400"/>
    </linearGradient>
    <style>
      .gordo, .cab, .fecha {
        font-family: 'Liberation Sans', 'FreeSans', Arial, sans-serif; font-weight: 700;
        text-anchor: middle; paint-order: stroke fill;
        stroke: #12080b; stroke-linejoin: round;
      }
      .gordo { font-size: ${cuerpo}px; fill: url(#oro); stroke-width: ${Math.round(cuerpo * 0.16)}px; }
      .cab   { font-size: ${Math.round(cuerpo * 0.62)}px; fill: #FFFFFF; stroke-width: ${Math.round(cuerpo * 0.11)}px; letter-spacing: ${Math.round(cuerpo * 0.04)}px; }
      .fecha { font-size: ${Math.round(cuerpo * 0.72)}px; fill: #FFFFFF; stroke-width: ${Math.round(cuerpo * 0.12)}px; }
    </style>
  </defs>
  ${fondo}
  ${piezas.join('\n  ')}
</svg>`;
}

/** Fecha en español para la miniatura: "MIÉRCOLES 23 DE SEPTIEMBRE". */
function fechaEnEspanol(fecha = new Date(), zona = process.env.CHANNEL_TIMEZONE || 'America/New_York') {
  const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: zona }).format(fecha);
  const numero = new Intl.DateTimeFormat('es-ES', { day: 'numeric', timeZone: zona }).format(fecha);
  const mes = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: zona }).format(fecha);
  return `${dia} ${numero} de ${mes}`;
}

/**
 * Thumbnail: 1280x720 warm dawn background (or a photo, darkened) with the
 * title wrapped in a serif and the format tag above it. Returns an SVG string.
 */
function thumbnailSvg(title, options = {}) {
  const { main, tag } = splitTitle(title);
  const [top, mid, bottom, glow] = PALETTES[(options.paletteIndex || 0) % PALETTES.length];
  const lines = wrapWords(main, 22).slice(0, 3);
  const fontSize = lines.length >= 3 ? 84 : lines.length === 2 ? 96 : 108;
  const lineHeight = fontSize * 1.12;
  const startY = 360 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
  const tagText = escapeHtml(tag || options.channelName || process.env.CHANNEL_NAME || '');
  const image = options.imageHref
    ? `<image href="${options.imageHref}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
       <rect width="1280" height="720" fill="rgba(20,12,24,0.5)"/>`
    : `<rect width="1280" height="720" fill="url(#sky)"/>
       <ellipse cx="640" cy="600" rx="520" ry="300" fill="url(#sun)"/>`;
  const text = lines.map((line, i) =>
    `<text x="640" y="${(startY + i * lineHeight).toFixed(0)}" text-anchor="middle" font-size="${fontSize}" class="t">${escapeHtml(line)}</text>`
  ).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${top}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${bottom}"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${glow}" stop-opacity="0.85"/><stop offset="45%" stop-color="${glow}" stop-opacity="0.25"/><stop offset="100%" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
    </radialGradient>
    <style>
      .t { font-family: 'Bitstream Charter', 'Liberation Serif', 'FreeSerif', Georgia, serif; fill: #fff7ea; font-weight: 400; }
      .tag { font-family: 'Liberation Sans', 'FreeSans', Arial, sans-serif; fill: #ffe9c4; font-size: 30px; letter-spacing: 6px; }
    </style>
  </defs>
  ${image}
  <rect width="1280" height="720" fill="url(#vig)"/>
  <text x="640" y="${(startY - lineHeight * 0.9 - 10).toFixed(0)}" text-anchor="middle" class="tag">${tagText.toUpperCase()}</text>
  ${text}
</svg>`;
}

/**
 * ffmpeg filter that lays `music` under the narration at musicGainDb(), looped,
 * with a fade-in and a fade-out that ends with the voice.
 */
function musicMixFilter(narrationSeconds, gainDb = musicGainDb()) {
  const fadeOut = Math.min(6, Math.max(2, narrationSeconds * 0.1));
  const fadeStart = Math.max(0, narrationSeconds - fadeOut);
  return [
    `[2:a]volume=${gainDb}dB,afade=t=in:st=0:d=4,afade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeOut.toFixed(2)}[music]`,
    `[1:a][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mix]`
  ].join(';');
}

module.exports = {
  thumbnailLoudSvg, fechaEnEspanol, wrapWords,
  isEnabled, listBackgrounds, listMusic, pickMusic, musicGainDb, musicGainFor,
  slideshowHtml, thumbnailSvg, musicMixFilter, splitTitle, wrapWords, PALETTES
};
