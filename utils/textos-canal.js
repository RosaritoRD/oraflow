/**
 * The channel's texts, editable from the panel (Social → Texts and links), 05/10/2026.
 * Each module asks for its text with `texto(clave)` or `lista(clave)`: if the owner
 * changed it in the panel, theirs comes out (setting `texto:<clave>`), otherwise the
 * factory one.
 * In-memory cache: loaded at startup (`carga(db)`) and refreshed on save, so the
 * modules that build texts without a database stay synchronous.
 *
 * Lists are written one option per line. {n} = ", Name" (Amén reply), {q} = who the
 * prayer is for (Amén + name).
 */
const GRUPOS = {
  instagram: 'Instagram',
  amen: 'Respuestas «Amén» (YouTube, Instagram, Facebook)',
  libro: 'Libro y cupón',
  youtube: 'Descripción de YouTube'
};
const GRUPOS_EN = {
  instagram: 'Instagram',
  amen: '«Amén» replies (YouTube, Instagram, Facebook)',
  libro: 'Book and coupon',
  youtube: 'YouTube description'
};

const DEFECTO = {
  comentario_general: { grupo: 'instagram', etiqueta: 'Comentario fijo — carruseles e imágenes', etiquetaEn: 'Pinned comment — carousels and images', valor: 'Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti y por los tuyos en el nombre de Jesús de Nazaret, el Rey de reyes 👑\n.\n.\n📩 Envíasela a alguien que necesite leerla hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  comentario_reel: { grupo: 'instagram', etiqueta: 'Comentario fijo — Reels', etiquetaEn: 'Pinned comment — Reels', valor: 'Si crees que Jesús de Nazaret es el Rey de reyes, escribe «Amén» y el nombre de alguien por quien quieres que oremos 👑\n.\n.\n📩 Envíasela a alguien que necesite escucharla hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  comentario_fecha: { grupo: 'instagram', etiqueta: 'Comentario fijo — oración de la mañana con fecha', etiquetaEn: 'Pinned comment — dated morning prayer', valor: 'Escribe «Amén» para recibir esta oración en tu día: hoy oramos por ti y por tu casa en el nombre de Jesús de Nazaret, el Rey de reyes 👑\n.\n.\n📩 Envíasela a tu familia como el buenos días de hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  aviso_privado: { grupo: 'instagram', etiqueta: 'Respuesta en el comentario al enviar la oración por privado (una por línea)', etiquetaEn: 'Reply on the comment when the prayer is sent privately (one per line)', lista: true, valor: [
    'Te envié una oración por mensaje privado 💌 Revísala con amor 🙏',
    '💌 Te acabo de enviar una oración por DM, ábrela con calma y con amor 🙏',
    'Te dejé una oración en tus mensajes privados 💌 Que Jesús, el Rey de reyes, te bendiga 🙏',
    '💌 Revisa tus mensajes: te envié una oración con mucho amor 🙏'
  ] },
  privado_inicio: { grupo: 'instagram', etiqueta: 'Mensaje privado — saludo (antes de la oración)', etiquetaEn: 'Private message — greeting (before the prayer)', valor: '🙏 Gracias por orar con nosotros. Esta oración es para ti:' },
  privado_libro: { grupo: 'instagram', etiqueta: 'Mensaje privado — párrafo del libro ({cupon} y {libro} se rellenan solos)', etiquetaEn: 'Private message — book paragraph ({cupon} and {libro} are filled in automatically)', valor: '📖 Si la ansiedad no te deja descansar, preparamos «30 días de paz», un devocional con una oración, un versículo y un paso práctico para cada día.\n🎁 Con el código {cupon} tienes un 10 % de descuento: {libro}' },
  privado_cierre: { grupo: 'instagram', etiqueta: 'Mensaje privado — despedida', etiquetaEn: 'Private message — sign-off', valor: 'Que Jesús, el Rey de reyes, te bendiga hoy. 👑' },
  amen_respuestas: { grupo: 'amen', etiqueta: 'Respuestas a «Amén» ({n} = coma + nombre si se conoce; una por línea)', etiquetaEn: 'Replies to «Amén» ({n} = comma + name if known; one per line)', lista: true, valor: [
    'Amén 🙏 Que Jesús de Nazaret, el Rey de reyes, te bendiga hoy{n}.',
    'Amén 🙌 Gloria a Dios y a Jesús, nuestro Rey{n}. Bendiciones para ti y tu familia.',
    '¡Amén{n}! 🙏 Que la paz de Jesús, el Rey de reyes, guarde tu corazón hoy.',
    'Amén 🙏 Seguimos orando contigo en el nombre de Jesús de Nazaret, el Rey{n}.',
    'Amén{n} 🙌 Que Jesús, Rey de reyes, vaya delante de ti en este día.',
    'Amén 🙏 Toda la gloria a Dios y a Jesús, el Rey{n}. Gracias por orar con nosotros.'
  ] },
  amen_nombre: { grupo: 'amen', etiqueta: 'Respuestas a «Amén + nombre» ({q} = por quién se ora; una por línea)', etiquetaEn: 'Replies to «Amén + name» ({q} = who is being prayed for; one per line)', lista: true, valor: [
    'Amén 🙏 Hoy oramos por {q} en el nombre de Jesús de Nazaret, el Rey de reyes.',
    'Amén 🙏 Ponemos a {q} en las manos de Jesús, el Rey de reyes, que todo lo puede.',
    'Amén 🙏 Ya estamos orando por {q}. Que la paz de Jesús de Nazaret, el Rey, cubra su vida.'
  ] },
  cupon: { grupo: 'libro', etiqueta: 'Código de descuento (Hotmart)', etiquetaEn: 'Discount code (Hotmart)', valor: 'YOUR_COUPON', corto: true },
  libro_url: { grupo: 'libro', etiqueta: 'Página de venta del libro', etiquetaEn: 'Book sales page', valor: 'https://your-domain.com/libro', corto: true },
  libro_linea: { grupo: 'libro', etiqueta: 'Línea del libro en los textos de Instagram y Facebook (vacía = no se pone)', etiquetaEn: 'Book line in Instagram and Facebook texts (empty = left out)', valor: '📖 «30 días de paz», devocional para cuando la ansiedad no te deja descansar: your-domain.com/libro (enlace en el perfil)' },
  pie_youtube: { grupo: 'youtube', etiqueta: 'Pie de la descripción de YouTube (vacío = el del .env). Empieza con la raya ━━━', etiquetaEn: 'YouTube description footer (empty = the one in .env). Starts with the ━━━ rule', valor: '' }
};

const cache = {};

const limpia = (v, lista) => (lista
  ? String(Array.isArray(v) ? v.join('\n') : v || '').split('\n').map(l => l.trim()).filter(Boolean)
  : String(v ?? '').replace(/\r/g, ''));

/** Current text for a key (the panel's or the factory one). */
function texto(clave) {
  const d = DEFECTO[clave];
  if (!d) throw new Error(`Texto desconocido: ${clave}`);
  return clave in cache ? cache[clave] : d.valor;
}

/** Current list (never empty: if everything was deleted, the factory one comes back). */
function lista(clave) {
  const v = texto(clave);
  return Array.isArray(v) && v.length ? v : DEFECTO[clave].valor;
}

async function carga(db) {
  for (const clave of Object.keys(DEFECTO)) {
    const v = await db.getSetting(`texto:${clave}`);
    if (v === null || v === undefined) { delete cache[clave]; continue; }
    try { cache[clave] = DEFECTO[clave].lista ? JSON.parse(v) : v; } catch (_e) { delete cache[clave]; }
  }
  return cache;
}

/** Saves what was changed in the panel. `null` returns a key to its factory text. */
async function guarda(db, cambios = {}) {
  for (const [clave, valor] of Object.entries(cambios)) {
    const d = DEFECTO[clave];
    if (!d) return { error: `Texto desconocido: ${clave}` };
    if (valor === null) { await db.setSetting(`texto:${clave}`, null); delete cache[clave]; continue; }
    const v = limpia(valor, d.lista);
    if (!d.lista && v.length > 4000) return { error: `«${d.etiqueta}» es demasiado largo` };
    await db.setSetting(`texto:${clave}`, d.lista ? JSON.stringify(v) : v);
    cache[clave] = v;
  }
  return { ok: true };
}

/** For the panel: each text with its current value, the factory one and whether it was changed. */
function catalogo() {
  return Object.entries(DEFECTO).map(([clave, d]) => ({
    clave, grupo: d.grupo, grupoNombre: GRUPOS[d.grupo], grupoNombreEn: GRUPOS_EN[d.grupo], etiqueta: d.etiqueta, etiquetaEn: d.etiquetaEn, lista: Boolean(d.lista), corto: Boolean(d.corto),
    valor: texto(clave), defecto: d.valor, cambiado: clave in cache
  }));
}

module.exports = { DEFECTO, GRUPOS, texto, lista, carga, guarda, catalogo };
