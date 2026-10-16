/**
 * Picks the background landscape for the thumbnail according to the TIME it's
 * published.
 *
 * The channel's rule (23/09/2026): natural places only — forest, beach, river,
 * mountain, field, lake, waterfall. Never offices, desks, cities or work interiors.
 * Daytime in the morning; at night, the same place at night.
 *
 * Returns the local path of an already downloaded image, or null if there's nothing.
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

// The channel's places. Each with its day and night version, because "beach"
// at dawn and "beach" at midnight are two different searches.
const LUGARES = [
  { nombre: 'bosque',   dia: 'sunrise light through forest trees',   noche: 'forest at night under starry sky' },
  { nombre: 'playa',    dia: 'sunrise over calm beach',              noche: 'moonlight over the sea at night' },
  { nombre: 'rio',      dia: 'river in the forest at golden hour',   noche: 'river at night with moonlight' },
  { nombre: 'montana',  dia: 'sunrise over mountain valley',         noche: 'starry night sky over mountains' },
  { nombre: 'campo',    dia: 'morning light over green fields',      noche: 'night sky over quiet meadow' },
  { nombre: 'lago',     dia: 'misty lake at dawn',                   noche: 'calm lake at night with stars' },
  { nombre: 'cascada',  dia: 'waterfall in sunlight',                noche: 'waterfall at dusk' }
];

// None of this goes into a prayer thumbnail, even if the search returns it:
// they're the typical false positives of "morning"/"light".
const PROHIBIDO = [
  'office', 'desk', 'laptop', 'computer', 'meeting', 'business', 'startup',
  'coworking', 'city', 'street', 'traffic', 'car', 'urban', 'building',
  'interior', 'indoor', 'kitchen', 'bedroom', 'gym', 'party', 'bar',
  'oficina', 'escritorio', 'ordenador', 'ciudad', 'calle', 'coche'
];

/** 'manana' before 12, 'tarde' until 18, 'noche' after. */
function franja(fecha = new Date(), zona = process.env.CHANNEL_TIMEZONE || 'America/New_York') {
  const hora = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: zona
  }).format(fecha));
  if (hora < 12) return 'manana';
  if (hora < 18) return 'tarde';
  return 'noche';
}

/** The day of the year decides the place: that way three beaches don't come out in a row. */
function lugarDelDia(fecha = new Date()) {
  const inicio = Date.UTC(fecha.getUTCFullYear(), 0, 0);
  const dia = Math.floor((Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()) - inicio) / 86400000);
  return LUGARES[dia % LUGARES.length];
}

function esNatural(asset) {
  const texto = `${asset?.title || ''} ${(asset?.keywords || []).map(k => (typeof k === 'string' ? k : k?.name || '')).join(' ')}`.toLowerCase();
  return !PROHIBIDO.some(palabra => texto.includes(palabra));
}

function consultas(fecha = new Date(), zona) {
  const momento = franja(fecha, zona);
  const lugar = lugarDelDia(fecha);
  const clave = momento === 'noche' ? 'noche' : 'dia';
  // The day's place first; the other two as a fallback if there are no results.
  const otros = LUGARES.filter(l => l.nombre !== lugar.nombre).slice(0, 2);
  return {
    momento,
    lugar: lugar.nombre,
    queries: [lugar[clave], ...otros.map(l => l[clave])]
  };
}

/**
 * @param {object} opciones
 * @param {object} opciones.stockMedia  StockMediaService
 * @param {Date}   [opciones.cuando]    publish time (defaults to now)
 * @param {Set}    [opciones.excluir]   ids of assets already used
 * @returns {Promise<{ruta, momento, lugar, assetId}|null>}
 */
async function eligeFondo({ stockMedia, cuando = new Date(), excluir = new Set(), logger = console, destino = null } = {}) {
  if (!stockMedia || !(await stockMedia.isAvailable().catch(() => false))) return null;
  const { momento, lugar, queries } = consultas(cuando);
  const carpeta = destino || path.join(__dirname, '..', 'data', 'assets', 'thumbnails');
  await fs.mkdir(carpeta, { recursive: true });

  for (const query of queries) {
    try {
      const candidatos = await stockMedia.search({
        queries: [query],
        preferredAssetType: 'image',
        orientation: 'landscape',
        excludeIds: excluir,
        limit: 10
      });
      const buenos = candidatos
        .filter(a => a.type === 'image' && esNatural(a))
        .sort((a, b) => stockMedia.score(b, { visualIntent: query, sceneQueries: [query], usedIds: excluir, aspectRatio: '16:9' })
                      - stockMedia.score(a, { visualIntent: query, sceneQueries: [query], usedIds: excluir, aspectRatio: '16:9' }));
      if (!buenos.length) continue;
      const ruta = await stockMedia.download(buenos[0], carpeta);
      logger.info?.(`Fondo de miniatura: ${lugar} de ${momento} — "${query}"`);
      return { ruta, momento, lugar, assetId: buenos[0].id, query };
    } catch (error) {
      logger.warn?.(`Background search failed ("${query}"): ${error.message}`);
    }
  }
  return null;
}

/**
 * The person praying who goes on the RIGHT of the thumbnail (the pattern of Grace
 * Oasis and almost every channel in the niche): hands together, eyes closed, warm
 * light behind. Requested vertical/square because it takes up half the thumbnail.
 */
const ORANDO = {
  manana: [
    'woman praying hands sunrise golden light',
    'person praying hands together outdoors morning',
    'man praying hands field sunrise'
  ],
  noche: [
    'woman praying hands at night candle light',
    'person praying hands together evening prayer',
    'man praying hands night sky'
  ]
};

// What gives away a photo that does NOT work for a prayer thumbnail.
const NO_ORANTE = ['office', 'desk', 'laptop', 'business', 'yoga', 'meditation studio',
  'spa', 'massage', 'gym', 'wedding', 'kiss', 'couple in bed'];

async function eligePersonaOrando({ stockMedia, cuando = new Date(), excluir = new Set(), logger = console, destino = null } = {}) {
  if (!stockMedia || !(await stockMedia.isAvailable().catch(() => false))) return null;
  const momento = franja(cuando) === 'noche' ? 'noche' : 'manana';
  const carpeta = destino || path.join(__dirname, '..', 'data', 'assets', 'thumbnails');
  await fs.mkdir(carpeta, { recursive: true });

  for (const query of ORANDO[momento]) {
    try {
      const candidatos = await stockMedia.search({
        queries: [query], preferredAssetType: 'image',
        orientation: 'portrait', excludeIds: excluir, limit: 10
      });
      const buenos = candidatos.filter((a) => {
        if (a.type !== 'image') return false;
        const texto = `${a.title || ''} ${(a.keywords || []).map((k) => (typeof k === 'string' ? k : k?.name || '')).join(' ')}`.toLowerCase();
        if (NO_ORANTE.some((t) => texto.includes(t))) return false;
        return /pray|praying|prayer|orando|rezando|worship/.test(texto);   // that they really come out praying
      });
      if (!buenos.length) continue;
      const ruta = await stockMedia.download(buenos[0], carpeta);
      logger.info?.(`Persona orando (${momento}): "${query}"`);
      return { ruta, momento, assetId: buenos[0].id, query };
    } catch (error) {
      logger.warn?.(`Praying-person search failed ("${query}"): ${error.message}`);
    }
  }
  return null;
}

/**
 * Channel logo for the thumbnail's top-left corner.
 * Put a PNG (with transparency) at `data/assets/marca/logo.png`, or the path in
 * CHANNEL_LOGO. If there's none, it returns null and the thumbnail comes out
 * without a logo — one is never invented.
 */
async function logoDelCanal() {
  const candidatos = [
    process.env.CHANNEL_LOGO,
    path.join(__dirname, '..', 'data', 'assets', 'marca', 'logo.png'),
    path.join(__dirname, '..', 'data', 'assets', 'marca', 'logo.jpg')
  ].filter(Boolean);
  for (const ruta of candidatos) {
    try {
      const st = await fs.stat(ruta);
      if (st.isFile() && st.size > 0) return ruta;
    } catch { /* siguiente */ }
  }
  return null;
}

/**
 * AI-generated background: a SINGLE image with the praying person already blended into
 * the landscape, which is what the big channels do. With two stock photos glued
 * together the cut shows; this way the light is consistent.
 *
 * ~$0.04 per image with gpt-image-2 at medium quality. Turned off with
 * THUMBNAIL_AI=off.
 */
async function generaFondoIA({ titulo = '', cuando = new Date(), openai = null, logger = console, destino = null } = {}) {
  if (String(process.env.THUMBNAIL_AI || 'on').toLowerCase() === 'off') return null;
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return null;

  const momento = franja(cuando);
  const lugar = lugarDelDia(cuando);
  const escena = momento === 'noche'
    ? `${lugar.noche}, noche serena, luz de luna cálida`
    : `${lugar.dia}, amanecer dorado`;
  // The subject rotates with the day so the channel isn't always the same person.
  const sujetos = [
    'una mujer latina de unos 40 años orando con las manos juntas, de perfil',
    'un hombre latino de unos 45 años orando con las manos juntas, de perfil',
    'unas manos juntas en oración sobre una Biblia abierta con una vela encendida'
  ];
  const sujeto = sujetos[cuando.getUTCDate() % sujetos.length];

  const prompt = `${sujeto}, situado en el lado DERECHO del encuadre. Detrás: ${escena}. `
    + `Luz cálida y coherente en toda la imagen, atmósfera de paz y recogimiento. `
    + `El lado IZQUIERDO del encuadre queda despejado y algo más oscuro para poner texto encima. `
    + `Fotorrealista, cinematográfico, 16:9. Sin texto, sin letras, sin marcas de agua.`;

  try {
    const OpenAI = require('openai');
    const cliente = openai || new OpenAI({ apiKey: clave });
    const t0 = Date.now();
    const r = await cliente.images.generate({
      model: process.env.IMAGE_MODEL || 'gpt-image-2',
      prompt, size: '1536x1024',
      quality: process.env.IMAGE_QUALITY || 'medium', n: 1
    });
    const b64 = r?.data?.[0]?.b64_json;
    if (!b64) throw new Error('the API returned no image');
    const carpeta = destino || path.join(__dirname, '..', 'data', 'assets', 'thumbnails');
    await fs.mkdir(carpeta, { recursive: true });
    const ruta = path.join(carpeta, `ia_${Date.now()}.png`);
    await fs.writeFile(ruta, Buffer.from(b64, 'base64'));
    logger.info?.(`AI thumbnail background (${lugar.nombre}, ${momento}) in ${Math.round((Date.now() - t0) / 1000)}s`);
    return { ruta, momento, lugar: lugar.nombre, origen: 'ia', prompt };
  } catch (error) {
    logger.warn?.(`AI background unavailable (${error.message}); using the image bank`);
    return null;
  }
}

/**
 * Backgrounds hand-made by the owner with ChatGPT Plus (29/09/2026): the OpenAI
 * API was eating the balance. `manana/` and `noche/` folders inside
 * FONDOS_MANUALES_DIR (data/assets/fondos-miniatura by default). The oldest one
 * for the time of day is used and moved to `usados/` so it isn't repeated.
 */
const EXT_IMAGEN = /\.(jpe?g|png|webp)$/i;

function carpetaFondosManuales() {
  return process.env.FONDOS_MANUALES_DIR || path.join(__dirname, '..', 'data', 'assets', 'fondos-miniatura');
}

async function fondoManual({ cuando = new Date(), logger = console, raiz = carpetaFondosManuales() } = {}) {
  const momento = franja(cuando) === 'noche' ? 'noche' : 'manana';
  const carpeta = path.join(raiz, momento);
  const nombres = (await fs.readdir(carpeta).catch(() => [])).filter(n => EXT_IMAGEN.test(n));
  if (!nombres.length) return null;
  const conFecha = await Promise.all(nombres.map(async n => ({ n, t: (await fs.stat(path.join(carpeta, n))).mtimeMs })));
  conFecha.sort((a, b) => a.t - b.t || a.n.localeCompare(b.n));
  const elegido = conFecha[0].n;
  const usados = path.join(raiz, 'usados');
  await fs.mkdir(usados, { recursive: true });
  const ruta = path.join(usados, `${momento}_${Date.now()}_${elegido}`);
  await fs.rename(path.join(carpeta, elegido), ruta);
  logger.info?.(`Fondo de miniatura manual (${momento}): ${elegido} — quedan ${nombres.length - 1}`);
  return { ruta, momento, origen: 'manual', quedan: nombres.length - 1 };
}

/*
 * Background collection (30/09/2026): images that ROTATE forever in
 * fondos-miniatura/coleccion/ (hands praying over the Bible, people praying…,
 * made with ChatGPT/Gemini or the AI ones already paid for). Each use comes out
 * edited differently at no cost: another framing (always anchored to the right,
 * where the subject is, because the text goes on the left) and another tone; at
 * night, darker and bluer. The rotation state lives in coleccion/_rotacion.json.
 */
const ENCUADRES = [
  { zoom: 1.0, alto: 0.5 }, { zoom: 1.1, alto: 0.35 }, { zoom: 1.05, alto: 0.65 },
  { zoom: 1.16, alto: 0.5 }, { zoom: 1.08, alto: 0.4 }
];
const TONOS_DIA = [
  { brightness: 1.0, saturation: 1.0, hue: 0 }, { brightness: 1.05, saturation: 1.12, hue: -5 },
  { brightness: 0.97, saturation: 1.08, hue: 5 }, { brightness: 1.03, saturation: 1.15, hue: 0 },
  { brightness: 1.0, saturation: 1.05, hue: -8 }
];

async function editaFondo(origen, { usos = 0, momento = 'manana', salida, sinRecorte = false }) {
  const sharp = require('./safe-sharp');
  const { width: W, height: H } = await sharp(origen).metadata();
  // Backgrounds that already carry the logo inside: full framing, only the tone changes.
  const e = sinRecorte ? { zoom: 1, alto: 0.5 } : ENCUADRES[usos % ENCUADRES.length];
  let cw = Math.min(W, Math.round(H * 16 / 9));
  let ch = Math.round(cw * 9 / 16);
  cw = Math.round(cw / e.zoom);
  ch = Math.round(ch / e.zoom);
  const left = W - cw;                                   // anchored to the right: the subject doesn't fall out
  const top = Math.round((H - ch) * e.alto);
  let img = sharp(origen).extract({ left, top, width: cw, height: ch }).resize(1280, 720, { fit: 'cover' });
  if (momento === 'noche') {
    img = img.modulate({ brightness: 0.55, saturation: 0.75 })
      .recomb([[0.8, 0.05, 0], [0, 0.85, 0.05], [0.05, 0.1, 1.2]]);
  } else {
    img = img.modulate(TONOS_DIA[usos % TONOS_DIA.length]);
  }
  await img.jpeg({ quality: 90 }).toFile(salida);
  return salida;
}

/*
 * MAIN backgrounds (02/10/2026: «the same thumbnail, the one with the Bible and the
 * hand, on most videos»; the most-watched long video had it).
 * coleccion/_principal.json = ["name.png", …]. They come out FONDO_PRINCIPAL_PCT % of
 * the time (80 by default); the rest rotates among the others so the channel doesn't
 * look cloned. Without the file, everything as before.
 */
async function listaJson(carpeta, archivo, nombres) {
  try {
    const lista = JSON.parse(await fs.readFile(path.join(carpeta, archivo), 'utf8'));
    return Array.isArray(lista) ? nombres.filter(n => lista.includes(n)) : [];
  } catch { return []; }
}
const principales = (carpeta, nombres) => listaJson(carpeta, '_principal.json', nombres);

function porcentajePrincipal() {
  const v = Number(process.env.FONDO_PRINCIPAL_PCT);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 80;
}

async function fondoColeccion({ cuando = new Date(), logger = console, raiz = carpetaFondosManuales(), azar = Math.random } = {}) {
  const carpeta = path.join(raiz, 'coleccion');
  const todos = (await fs.readdir(carpeta).catch(() => [])).filter(n => EXT_IMAGEN.test(n)).sort();
  if (!todos.length) return null;
  const favoritas = await principales(carpeta, todos);
  const otras = todos.filter(n => !favoritas.includes(n));
  const tocaPrincipal = favoritas.length && (!otras.length || azar() < porcentajePrincipal() / 100);
  const nombres = favoritas.length ? (tocaPrincipal ? favoritas : otras) : todos;
  const rutaEstado = path.join(carpeta, '_rotacion.json');
  let estado = {};
  try { estado = JSON.parse(await fs.readFile(rutaEstado, 'utf8')); } catch { estado = {}; }
  const ultimo = estado._ultimo;
  const candidatos = nombres.filter(n => nombres.length === 1 || n !== ultimo);
  candidatos.sort((a, b) => ((estado[a]?.usos || 0) - (estado[b]?.usos || 0))
    || String(estado[a]?.en || '').localeCompare(String(estado[b]?.en || '')) || a.localeCompare(b));
  const nombre = candidatos[0];
  const usos = estado[nombre]?.usos || 0;
  const momento = franja(cuando) === 'noche' ? 'noche' : 'manana';
  // _con_logo.json (02/10/2026): images that already carry the channel's logo.
  // They aren't cropped (it would be cut) and the thumbnail doesn't draw another
  // logo on top.
  const conLogo = (await listaJson(carpeta, '_con_logo.json', todos)).includes(nombre);
  const salida = path.join(require('os').tmpdir(), `coleccion_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`);
  await editaFondo(path.join(carpeta, nombre), { usos, momento, salida, sinRecorte: conLogo });
  estado[nombre] = { usos: usos + 1, en: new Date().toISOString() };
  estado._ultimo = nombre;
  await fs.writeFile(rutaEstado, JSON.stringify(estado, null, 1));
  logger.info?.(`Collection background (${momento}${favoritas.includes(nombre) ? ', main' : ''}): ${nombre}, use #${usos + 1} of ${todos.length} backgrounds`);
  return { ruta: salida, momento, origen: 'coleccion', nombre, usos: usos + 1, conLogo };
}

/** Your backgrounds first, AI if it's on, the stock library otherwise, and null if there's nothing either. */
async function fondoDeMiniatura(opciones = {}) {
  const manual = (await fondoManual(opciones)) || (await fondoColeccion(opciones)) || (await generaFondoIA(opciones));
  if (manual) return manual;
  // 29/09/2026: the designer never passed stockMedia and the library always
  // returned null (it went unnoticed while the AI was providing images): a
  // thumbnail with no background.
  const stockMedia = opciones.stockMedia || new (require('./stock-media-service').StockMediaService)({
    logger: opciones.logger, cacheDir: path.join(__dirname, '..', 'data', 'assets', 'stock')
  });
  return eligeFondo({ ...opciones, stockMedia });
}

module.exports = { fondoManual, fondoColeccion, editaFondo, carpetaFondosManuales, eligeFondo, eligePersonaOrando, logoDelCanal, generaFondoIA, fondoDeMiniatura, consultas, franja, lugarDelDia, esNatural, LUGARES, PROHIBIDO, ORANDO };
