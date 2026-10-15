/**
 * Miniatura del canal de oración (referencia del autor, 24/09/2026):
 *   logo redondo arriba a la izquierda
 *   titular a la izquierda en 2-3 líneas: blanco / DORADO / blanco,
 *     con una barra dorada bajo la línea dorada
 *   pasaje ("SALMO 121") en dorado pequeño
 *   etiqueta de formato espaciada abajo ("ORACIÓN DE LA MAÑANA")
 *   fondo IA con el sujeto a la derecha, oscurecido por la izquierda
 * El texto lo pone el código (la IA escribe mal las letras).
 */
const fs = require('fs').promises;
const path = require('path');

const W = 1280;
const H = 720;
const MAX_LINEA = 14;

function escapa(texto) {
  return String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Frase corta para la miniatura: el tema antes de "|", o el título sin la cabecera. */
// "Oración de la mañana: …", "Oración de la noche para …": la etiqueta de abajo ya lo dice.
// «Oración (corta|poderosa) (de la mañana|…) (: — para por de)» se quita: el
// titular es la NECESIDAD («PROTECCIÓN PARA TU FAMILIA»), no la palabra «oración».
const CABECERA = /^\s*oraci[oó]n\s+((corta|poderosa)\s+)?(de\s+la\s+(mañana|noche|tarde)|matutina|nocturna)?\s*([:—-]|\b(para|por|de)\b)?\s*/i;
// Emojis y citas entre paréntesis no van en letra gigante (02/10/2026).
const limpiaTitulo = t => String(t || '')
  .replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '')
  .replace(/\s*\((?:[^()]*\d+:\d+[^()]*)\)/g, '')
  .replace(/\s+/g, ' ').trim();

/** Franja del día que dice un texto, o null si no dice ninguna. */
function franjaDe(texto = '') {
  const t = String(texto || '');
  if (/noche|dormir|nocturn/i.test(t)) return 'NOCHE';
  if (/tarde/i.test(t)) return 'TARDE';
  if (/mañana|matutin|amanecer/i.test(t)) return 'MAÑANA';
  return null;
}

/** El gancho del título: lo que va tras el último "|" ("… | RECIBE PAZ AL ENTREGAR TUS CARGAS"). */
// 03/10/2026: el título de los largos acaba en la cita («… | Salmo 27»): esa
// parte no es un gancho, se salta.
const ES_CITA = /^(?:[1-3]\s*)?\p{L}[\p{L}\s]{1,24}?\s+\d{1,3}(?::\d{1,3}(?:\s*[-–]\s*\d{1,3})?)?$/u;
function ganchoDelTitulo(title = '') {
  const partes = String(title || '').split('|').map(p => p.trim());
  while (partes.length > 1 && ES_CITA.test(partes[partes.length - 1])) partes.pop();
  return partes.length > 1 ? partes[partes.length - 1] : '';
}

function titular({ topic = '', title = '' } = {}) {
  topic = limpiaTitulo(topic);
  title = limpiaTitulo(title);
  // 27/09/2026: una idea "antes de dormir" publicada como ORACIÓN DE LA MAÑANA
  // sacaba "…ANTES DE DORMIR" en la miniatura. Lo publicado es el título: si el
  // tema dice otra franja, manda el gancho del título.
  const ft = franjaDe(title.split('|')[0]);
  const fp = franjaDe(topic);
  const gancho = ganchoDelTitulo(title);
  if (ft && fp && ft !== fp && gancho) return gancho.replace(/\s+/g, ' ').toUpperCase();
  const base = String(topic || '').split('|')[0].replace(CABECERA, '').trim() ||
    String(title || '').split('|')[0].replace(CABECERA, '').trim() ||
    String(title || '').trim();
  return base.replace(/\s+/g, ' ').toUpperCase();
}

function aLineas(palabras) {
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (prueba.length > MAX_LINEA && actual) { lineas.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** Hasta 3 líneas de ≤14 caracteres; si no cabe, se queda con lo anterior a la coma. */
// Palabras con las que una línea del titular nunca puede terminar.
const COLGANTES = new Set(['DE', 'DEL', 'EN', 'A', 'AL', 'CON', 'POR', 'PARA', 'SIN', 'SOBRE', 'Y', 'O',
  'EL', 'LA', 'LOS', 'LAS', 'UN', 'UNA', 'TU', 'TUS', 'MI', 'MIS', 'SU', 'SUS', 'QUE']);
const PREPOSICIONES = new Set(['DE', 'DEL', 'EN', 'A', 'AL', 'CON', 'POR', 'PARA', 'SIN', 'SOBRE']);

/* No cabe en 3 líneas (02/10/2026: «…LAS MANOS DE» se comía «DIOS»): se quita
   la coletilla desde la primera preposición que deje una frase con sentido
   («SOLTAR LA ANSIEDAD | EN LAS MANOS DE DIOS»). Si no hay ninguna, se corta
   por palabras pero sin dejar la frase colgando en «DE», «LA»… */
function recortaColetilla(palabras) {
  // El corte más temprano que deje al menos 3 palabras: «SOLTAR LA ANSIEDAD» y no
  // «SOLTAR LA ANSIEDAD EN LAS MANOS», que cabe pero se queda sin sentido.
  for (let i = 3; i < palabras.length; i += 1) {
    if (!PREPOSICIONES.has(palabras[i])) continue;
    const resto = aLineas(palabras.slice(0, i));
    if (resto.length <= 3) return resto;
  }
  const lineas = aLineas(palabras).slice(0, 3);
  const ultima = lineas[lineas.length - 1].split(' ');
  while (ultima.length > 1 && COLGANTES.has(ultima[ultima.length - 1])) ultima.pop();
  lineas[lineas.length - 1] = ultima.join(' ');
  return lineas;
}

function reparteTitular(texto) {
  const limpio = String(texto || '').trim();
  // La coma corta primero; si aun así no cabe, también " Y " ("USAR BIEN TUS PALABRAS Y HABLAR…").
  let partes = limpio.split(/,\s*/);
  const noCabe = partes.flatMap(p => aLineas(p.split(/\s+/).filter(Boolean))).length > 3;
  if (noCabe) partes = partes.flatMap(p => p.split(/\s+Y\s+/i));
  // La coma marca un corte natural: "CUBRE A MI FAMILIA HOY, SEÑOR" → "SEÑOR" en su línea.
  let lineas = partes.flatMap(p => aLineas(p.split(/\s+/).filter(Boolean)));
  if (lineas.length > 3) {
    // No cabe entero: la parte con más contenido que quepa en 3 líneas
    // ("SEÑOR, VE DELANTE DE MÍ…" → "VE DELANTE DE MÍ…", no "SEÑOR").
    // Cada trozo, recortado si no cabe; gana el que más dice (antes ganaba el
    // primero que cupiera, y salía «DIFÍCIL» solo).
    const opciones = partes
      .map(p => p.split(/\s+/).filter(Boolean))
      .map(palabras => { const l = aLineas(palabras); return l.length <= 3 ? l : recortaColetilla(palabras); })
      .sort((a, b) => b.join(' ').length - a.join(' ').length);
    lineas = opciones[0];
  }
  lineas = lineas.map(l => l.replace(/[,;:]$/, ''));
  const dorada = lineas.length === 1 ? 0 : 1;
  return { lineas, dorada };
}

/** La franja la manda el título (lo que se publica); si no dice ninguna, el tema. */
function etiquetaFormato(topic = '', title = '') {
  const franja = franjaDe(String(title || '').split('|')[0]) || franjaDe(topic) || 'MAÑANA';
  return `ORACIÓN DE LA ${franja}`;
}

function pasajeCorto(escrituras = []) {
  const ref = (escrituras || []).map(e => e?.reference).find(Boolean);
  if (!ref) return null;
  return String(ref).replace(/:\S*$/, '').trim().toUpperCase();
}

/** Tamaño que cabe en `ancho` px (Liberation Sans Bold en mayúsculas ≈ 0,68 em por letra). */
function cuerpoQueCabe(texto, maximo, ancho = 700) {
  return Math.min(maximo, Math.floor(ancho / (Math.max(1, texto.length) * 0.68)));
}

/* 03/10/2026 (el autor, con miniaturas de la competencia de referencia): el
   titular ocupa casi toda la altura, en letra CONDENSADA (Oswald Bold,
   instalada por fuentes-sistema.js) y con borde negro, para que se lea en un
   móvil y a una audiencia mayor. Oswald Bold en mayúsculas ≈ 0,52 em por letra. */
const ANCHO_TITULAR = 800;
const ALTO_TITULAR = 430;
const tamañoLinea = (linea, maximo) => Math.min(maximo, Math.floor(ANCHO_TITULAR / (Math.max(1, linea.length) * 0.52)));

function miniaturaSvg({ lineas, dorada, pasaje = null, etiqueta = 'ORACIÓN DE LA MAÑANA', logo = null }) {
  const x = 50;
  let tamaños = lineas.map((l, i) => tamañoLinea(l, i === dorada ? 200 : 165));
  const alto = t => t.reduce((a, b) => a + b * 1.02, 0);
  if (alto(tamaños) > ALTO_TITULAR) {
    const k = ALTO_TITULAR / alto(tamaños);
    tamaños = tamaños.map(t => Math.floor(t * k));
  }
  let y = 150 + Math.max(0, Math.round((ALTO_TITULAR - alto(tamaños)) / 2));
  const piezas = [];
  lineas.forEach((linea, i) => {
    const oro = i === dorada;
    const cuerpo = tamaños[i];
    y += Math.round(cuerpo * 0.96);
    piezas.push(`<text x="${x}" y="${y}" class="${oro ? 'oro' : 'blanco'}" font-size="${cuerpo}" stroke-width="${Math.max(4, Math.round(cuerpo * 0.07))}">${escapa(linea)}</text>`);
    y += Math.round(cuerpo * 0.06);
  });
  if (pasaje) piezas.push(`<text x="${x}" y="676" class="pasaje">${escapa(pasaje)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sombra" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#050308" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="#050308" stop-opacity="0.72"/>
      <stop offset="80%" stop-color="#050308" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#050308" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="circulo"><circle cx="82" cy="78" r="50"/></clipPath>
    <filter id="borde" x="-5%" y="-20%" width="110%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.8"/>
    </filter>
    <style>
      text { font-family: 'Oswald', 'Liberation Sans Narrow', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif; font-weight: 700; filter: url(#borde); paint-order: stroke; stroke: #000; stroke-linejoin: round; }
      .blanco { fill: #FFFFFF; }
      .oro { fill: #FFD23F; }
      .pasaje { fill: #FFD97A; font-size: 48px; letter-spacing: 3px; stroke-width: 4; }
      .etiqueta { fill: #FFE3A3; font-size: 40px; letter-spacing: 5px; stroke-width: 4; }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sombra)"/>
  ${logo ? `<image href="${logo}" x="32" y="28" width="100" height="100" clip-path="url(#circulo)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="82" cy="78" r="50" fill="none" stroke="#0B1A33" stroke-width="3"/>` : ''}
  <text x="150" y="94" class="etiqueta">${escapa(etiqueta)}</text>
  ${piezas.join('\n  ')}
</svg>`;
}

/**
 * Compone la miniatura final (1280×720 JPG) sobre `fondo`.
 * @returns {Promise<string>} ruta del JPG
 */
async function componeMiniatura({ sharp, fondo, logoPath = null, topic, title, escrituras, salida }) {
  const { lineas, dorada } = reparteTitular(titular({ topic, title }));
  const logo = logoPath
    ? `data:image/png;base64,${(await sharp(logoPath).resize(200, 200).png().toBuffer()).toString('base64')}`
    : null;
  const svg = miniaturaSvg({ lineas, dorada, pasaje: pasajeCorto(escrituras), etiqueta: etiquetaFormato(topic, title), logo });
  const base = fondo
    ? await sharp(fondo).resize(W, H, { fit: 'cover', position: 'right' }).toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 3, background: '#0b0a12' } }).png().toBuffer();
  await fs.mkdir(path.dirname(salida), { recursive: true });
  await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 90 }).toFile(salida);
  return salida;
}

module.exports = { franjaDe, titular, reparteTitular, etiquetaFormato, pasajeCorto, miniaturaSvg, componeMiniatura };
