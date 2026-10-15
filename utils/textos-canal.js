/**
 * Textos del canal editables desde el panel (Redes → Textos y enlaces), 05/10/2026.
 * Cada módulo pide su texto con `texto(clave)` o `lista(clave)`: si el autor lo
 * cambió en el panel sale el suyo (setting `texto:<clave>`), si no el de fábrica.
 * Caché en memoria: se carga al arrancar (`carga(db)`) y se renueva al guardar,
 * así los módulos que arman textos sin base de datos siguen siendo síncronos.
 *
 * Las listas se escriben una opción por línea. {n} = ", Nombre" (respuesta Amén),
 * {q} = por quién se ora (Amén + nombre).
 */
const GRUPOS = {
  instagram: 'Instagram',
  amen: 'Respuestas «Amén» (YouTube, Instagram, Facebook)',
  libro: 'Libro y cupón',
  youtube: 'Descripción de YouTube'
};

const DEFECTO = {
  comentario_general: { grupo: 'instagram', etiqueta: 'Comentario fijo — carruseles e imágenes', valor: 'Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti y por los tuyos en el nombre de Jesús de Nazaret, el Rey de reyes 👑\n.\n.\n📩 Envíasela a alguien que necesite leerla hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  comentario_reel: { grupo: 'instagram', etiqueta: 'Comentario fijo — Reels', valor: 'Si crees que Jesús de Nazaret es el Rey de reyes, escribe «Amén» y el nombre de alguien por quien quieres que oremos 👑\n.\n.\n📩 Envíasela a alguien que necesite escucharla hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  comentario_fecha: { grupo: 'instagram', etiqueta: 'Comentario fijo — oración de la mañana con fecha', valor: 'Escribe «Amén» para recibir esta oración en tu día: hoy oramos por ti y por tu casa en el nombre de Jesús de Nazaret, el Rey de reyes 👑\n.\n.\n📩 Envíasela a tu familia como el buenos días de hoy.\n▶️ La oración completa está en el enlace del perfil.' },
  aviso_privado: { grupo: 'instagram', etiqueta: 'Respuesta en el comentario al enviar la oración por privado (una por línea)', lista: true, valor: [
    'Te envié una oración por mensaje privado 💌 Revísala con amor 🙏',
    '💌 Te acabo de enviar una oración por DM, ábrela con calma y con amor 🙏',
    'Te dejé una oración en tus mensajes privados 💌 Que Jesús, el Rey de reyes, te bendiga 🙏',
    '💌 Revisa tus mensajes: te envié una oración con mucho amor 🙏'
  ] },
  privado_inicio: { grupo: 'instagram', etiqueta: 'Mensaje privado — saludo (antes de la oración)', valor: '🙏 Gracias por orar con nosotros. Esta oración es para ti:' },
  privado_libro: { grupo: 'instagram', etiqueta: 'Mensaje privado — párrafo del libro ({cupon} y {libro} se rellenan solos)', valor: '📖 Si la ansiedad no te deja descansar, preparamos «30 días de paz», un devocional con una oración, un versículo y un paso práctico para cada día.\n🎁 Con el código {cupon} tienes un 10 % de descuento: {libro}' },
  privado_cierre: { grupo: 'instagram', etiqueta: 'Mensaje privado — despedida', valor: 'Que Jesús, el Rey de reyes, te bendiga hoy. 👑' },
  amen_respuestas: { grupo: 'amen', etiqueta: 'Respuestas a «Amén» ({n} = coma + nombre si se conoce; una por línea)', lista: true, valor: [
    'Amén 🙏 Que Jesús de Nazaret, el Rey de reyes, te bendiga hoy{n}.',
    'Amén 🙌 Gloria a Dios y a Jesús, nuestro Rey{n}. Bendiciones para ti y tu familia.',
    '¡Amén{n}! 🙏 Que la paz de Jesús, el Rey de reyes, guarde tu corazón hoy.',
    'Amén 🙏 Seguimos orando contigo en el nombre de Jesús de Nazaret, el Rey{n}.',
    'Amén{n} 🙌 Que Jesús, Rey de reyes, vaya delante de ti en este día.',
    'Amén 🙏 Toda la gloria a Dios y a Jesús, el Rey{n}. Gracias por orar con nosotros.'
  ] },
  amen_nombre: { grupo: 'amen', etiqueta: 'Respuestas a «Amén + nombre» ({q} = por quién se ora; una por línea)', lista: true, valor: [
    'Amén 🙏 Hoy oramos por {q} en el nombre de Jesús de Nazaret, el Rey de reyes.',
    'Amén 🙏 Ponemos a {q} en las manos de Jesús, el Rey de reyes, que todo lo puede.',
    'Amén 🙏 Ya estamos orando por {q}. Que la paz de Jesús de Nazaret, el Rey, cubra su vida.'
  ] },
  cupon: { grupo: 'libro', etiqueta: 'Código de descuento (Hotmart)', valor: 'TU_CUPON', corto: true },
  libro_url: { grupo: 'libro', etiqueta: 'Página de venta del libro', valor: 'https://tu-dominio.com/libro', corto: true },
  libro_linea: { grupo: 'libro', etiqueta: 'Línea del libro en los textos de Instagram y Facebook (vacía = no se pone)', valor: '📖 «30 días de paz», devocional para cuando la ansiedad no te deja descansar: tu-dominio.com/libro (enlace en el perfil)' },
  pie_youtube: { grupo: 'youtube', etiqueta: 'Pie de la descripción de YouTube (vacío = el del .env). Empieza con la raya ━━━', valor: '' }
};

const cache = {};

const limpia = (v, lista) => (lista
  ? String(Array.isArray(v) ? v.join('\n') : v || '').split('\n').map(l => l.trim()).filter(Boolean)
  : String(v ?? '').replace(/\r/g, ''));

/** Texto actual de una clave (el del panel o el de fábrica). */
function texto(clave) {
  const d = DEFECTO[clave];
  if (!d) throw new Error(`Texto desconocido: ${clave}`);
  return clave in cache ? cache[clave] : d.valor;
}

/** Lista actual (nunca vacía: si se borró todo, vuelve la de fábrica). */
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

/** Guarda lo que se cambió en el panel. `null` devuelve una clave a su texto de fábrica. */
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

/** Para el panel: cada texto con su valor actual, el de fábrica y si está cambiado. */
function catalogo() {
  return Object.entries(DEFECTO).map(([clave, d]) => ({
    clave, grupo: d.grupo, grupoNombre: GRUPOS[d.grupo], etiqueta: d.etiqueta, lista: Boolean(d.lista), corto: Boolean(d.corto),
    valor: texto(clave), defecto: d.valor, cambiado: clave in cache
  }));
}

module.exports = { DEFECTO, GRUPOS, texto, lista, carga, guarda, catalogo };
