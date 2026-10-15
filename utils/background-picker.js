/**
 * Elige el paisaje de fondo para la miniatura según la HORA a la que se publica.
 *
 * Regla del canal (el autor, 23/09/2026): solo lugares naturales — bosque, playa,
 * río, montaña, campo, lago, cascada. Nunca oficinas, escritorios, ciudades ni
 * interiores de trabajo. De día por la mañana; de noche, el mismo sitio de noche.
 *
 * Devuelve la ruta local de una imagen ya descargada, o null si no hay nada.
 */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs').promises;

// Los lugares del canal. Cada uno con su versión de día y de noche, porque
// "playa" de madrugada y "playa" a medianoche son dos búsquedas distintas.
const LUGARES = [
  { nombre: 'bosque',   dia: 'sunrise light through forest trees',   noche: 'forest at night under starry sky' },
  { nombre: 'playa',    dia: 'sunrise over calm beach',              noche: 'moonlight over the sea at night' },
  { nombre: 'rio',      dia: 'river in the forest at golden hour',   noche: 'river at night with moonlight' },
  { nombre: 'montana',  dia: 'sunrise over mountain valley',         noche: 'starry night sky over mountains' },
  { nombre: 'campo',    dia: 'morning light over green fields',      noche: 'night sky over quiet meadow' },
  { nombre: 'lago',     dia: 'misty lake at dawn',                   noche: 'calm lake at night with stars' },
  { nombre: 'cascada',  dia: 'waterfall in sunlight',                noche: 'waterfall at dusk' }
];

// Nada de esto entra en una miniatura de oración, aunque el buscador lo
// devuelva: son los falsos positivos típicos de "morning"/"light".
const PROHIBIDO = [
  'office', 'desk', 'laptop', 'computer', 'meeting', 'business', 'startup',
  'coworking', 'city', 'street', 'traffic', 'car', 'urban', 'building',
  'interior', 'indoor', 'kitchen', 'bedroom', 'gym', 'party', 'bar',
  'oficina', 'escritorio', 'ordenador', 'ciudad', 'calle', 'coche'
];

/** 'manana' antes de las 12, 'tarde' hasta las 18, 'noche' después. */
function franja(fecha = new Date(), zona = process.env.CHANNEL_TIMEZONE || 'America/New_York') {
  const hora = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: zona
  }).format(fecha));
  if (hora < 12) return 'manana';
  if (hora < 18) return 'tarde';
  return 'noche';
}

/** El día del año decide el lugar: así no salen tres playas seguidas. */
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
  // El lugar del día primero; los otros dos como respaldo si no hay resultados.
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
 * @param {Date}   [opciones.cuando]    momento de publicación (por defecto, ahora)
 * @param {Set}    [opciones.excluir]   ids de assets ya usados
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
      logger.warn?.(`Búsqueda de fondo fallida ("${query}"): ${error.message}`);
    }
  }
  return null;
}

/**
 * La persona rezando que va a la DERECHA de la miniatura (patrón de Grace Oasis
 * y de casi todos los canales del nicho): manos juntas, ojos cerrados, luz
 * cálida detrás. Se pide en vertical/cuadrado porque ocupa media miniatura.
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

// Lo que delata una foto que NO sirve para una miniatura de oración.
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
        return /pray|praying|prayer|orando|rezando|worship/.test(texto);   // que salga rezando de verdad
      });
      if (!buenos.length) continue;
      const ruta = await stockMedia.download(buenos[0], carpeta);
      logger.info?.(`Persona orando (${momento}): "${query}"`);
      return { ruta, momento, assetId: buenos[0].id, query };
    } catch (error) {
      logger.warn?.(`Búsqueda de persona orando fallida ("${query}"): ${error.message}`);
    }
  }
  return null;
}

/**
 * Logo del canal para la esquina superior izquierda de la miniatura.
 * Se pone un PNG (con transparencia) en `data/assets/marca/logo.png`, o la ruta
 * que diga CHANNEL_LOGO. Si no hay ninguno, devuelve null y la miniatura sale
 * sin logo — nunca se inventa uno.
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
 * Fondo generado por IA: UNA sola imagen con la persona orando ya integrada en
 * el paisaje, que es lo que hacen los canales grandes. Con dos fotos de banco
 * pegadas se nota el corte; así la luz es coherente.
 *
 * ~$0,04 por imagen con gpt-image-2 en calidad media. Se apaga con THUMBNAIL_AI=off.
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
  // El sujeto rota con el día para que el canal no sea siempre la misma persona.
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
    if (!b64) throw new Error('la API no devolvió imagen');
    const carpeta = destino || path.join(__dirname, '..', 'data', 'assets', 'thumbnails');
    await fs.mkdir(carpeta, { recursive: true });
    const ruta = path.join(carpeta, `ia_${Date.now()}.png`);
    await fs.writeFile(ruta, Buffer.from(b64, 'base64'));
    logger.info?.(`Fondo de miniatura por IA (${lugar.nombre} de ${momento}) en ${Math.round((Date.now() - t0) / 1000)}s`);
    return { ruta, momento, lugar: lugar.nombre, origen: 'ia', prompt };
  } catch (error) {
    logger.warn?.(`Fondo por IA no disponible (${error.message}); se usa banco de imágenes`);
    return null;
  }
}

/**
 * Fondos hechos a mano por el autor con su ChatGPT Plus (29/09/2026): la API de
 * OpenAI se estaba comiendo el saldo. Carpetas `manana/` y `noche/` dentro de
 * FONDOS_MANUALES_DIR (por defecto data/assets/fondos-miniatura). Se usa el
 * más antiguo de la franja y se mueve a `usados/` para no repetirlo.
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
 * Colección de fondos (30/09/2026): imágenes que ROTAN para siempre en
 * fondos-miniatura/coleccion/ (manos orando sobre la Biblia, personas orando…,
 * hechas con ChatGPT/Gemini o las de IA ya pagadas). Cada uso sale editado
 * distinto sin coste: otro encuadre (siempre anclado a la derecha, donde está
 * el sujeto, porque el texto va a la izquierda) y otro tono; de noche, más
 * oscuro y azulado. El estado de la rotación vive en coleccion/_rotacion.json.
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
  // Fondos que ya traen el logo dentro: encuadre entero, solo cambia el tono.
  const e = sinRecorte ? { zoom: 1, alto: 0.5 } : ENCUADRES[usos % ENCUADRES.length];
  let cw = Math.min(W, Math.round(H * 16 / 9));
  let ch = Math.round(cw * 9 / 16);
  cw = Math.round(cw / e.zoom);
  ch = Math.round(ch / e.zoom);
  const left = W - cw;                                   // anclado a la derecha: el sujeto no se sale
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
 * Fondos PRINCIPALES (02/10/2026, el autor: «la misma miniatura, la de la Biblia
 * con la mano, en la mayoría de los vídeos»; el largo con más vistas la
 * llevaba). coleccion/_principal.json = ["nombre.png", …]. Salen el
 * FONDO_PRINCIPAL_PCT % de las veces (80 por defecto); el resto rota entre las
 * demás para que el canal no parezca clonado. Sin el archivo, todo igual que antes.
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
  // _con_logo.json (02/10/2026): imágenes que ya traen el logo del canal. No se
  // recortan (se cortaría) y la miniatura no pinta otro logo encima.
  const conLogo = (await listaJson(carpeta, '_con_logo.json', todos)).includes(nombre);
  const salida = path.join(require('os').tmpdir(), `coleccion_${Date.now()}_${crypto.randomBytes(3).toString('hex')}.jpg`);
  await editaFondo(path.join(carpeta, nombre), { usos, momento, salida, sinRecorte: conLogo });
  estado[nombre] = { usos: usos + 1, en: new Date().toISOString() };
  estado._ultimo = nombre;
  await fs.writeFile(rutaEstado, JSON.stringify(estado, null, 1));
  logger.info?.(`Fondo de la colección (${momento}${favoritas.includes(nombre) ? ', principal' : ''}): ${nombre}, uso nº ${usos + 1} de ${todos.length} fondos`);
  return { ruta: salida, momento, origen: 'coleccion', nombre, usos: usos + 1, conLogo };
}

/** Tus fondos primero, IA si está activada, banco de imágenes si no, y null si tampoco hay. */
async function fondoDeMiniatura(opciones = {}) {
  const manual = (await fondoManual(opciones)) || (await fondoColeccion(opciones)) || (await generaFondoIA(opciones));
  if (manual) return manual;
  // 29/09/2026: el diseñador nunca pasaba stockMedia y el banco devolvía null
  // siempre (no se notaba mientras la IA daba imagen): miniatura sin fondo.
  const stockMedia = opciones.stockMedia || new (require('./stock-media-service').StockMediaService)({
    logger: opciones.logger, cacheDir: path.join(__dirname, '..', 'data', 'assets', 'stock')
  });
  return eligeFondo({ ...opciones, stockMedia });
}

module.exports = { fondoManual, fondoColeccion, editaFondo, carpetaFondosManuales, eligeFondo, eligePersonaOrando, logoDelCanal, generaFondoIA, fondoDeMiniatura, consultas, franja, lugarDelDia, esNatural, LUGARES, PROHIBIDO, ORANDO };
