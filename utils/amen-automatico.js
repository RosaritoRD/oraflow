/**
 * Respuesta automática a los comentarios que son solo un «Amén» (el autor, 05/10/2026).
 *
 * Solo se responde lo que es claramente un Amén ("Amén 🙏", "AMEN AMEN",
 * "Amén, gloria a Dios") o un Amén con nombres por quien orar, que es lo que
 * piden las publicaciones ("Amén, María", "Amén por mi hija Ana"): ahí se
 * contesta "Hoy oramos por María…". Lo demás (salud, preguntas, historias) lo
 * contesta el autor a mano: una palabra fuera de la lista y no se toca.
 * Ritmo (el autor, 05/10/2026): una vuelta cada 30-90 min al azar, para que no
 * parezca un robot.
 * Redes: YouTube, Instagram y Facebook (Facebook necesita los permisos
 * pages_read_user_content y pages_manage_engagement en el token de la Página).
 *
 * Settings: amen_auto_enabled ('false' lo apaga), amen_respondidos (ids ya
 * contestados), amen_dia (tope diario), amen_proxima (cuándo toca la próxima vuelta).
 */
const crypto = require('crypto');

const TOPE_DIARIO = 150;
// Cada respuesta en YouTube gasta 50 de las 10.000 unidades diarias y cada subida 1.600:
// con 30 al día quedan unidades de sobra para los 3 vídeos (07/10/2026).
const TOPES_RED = { youtube: 30 };
const TOPE_IA_POR_VUELTA = 10;
const TOPE_POR_VUELTA = 25;
const MAX_HORAS = 72;
const MAX_IDS = 3000;
const PAUSA_PERMISO_MS = 6 * 3600000;
// Errores de Meta/Google que solo se arreglan dando permisos (no reintentando).
const esDePermiso = error => /\(#(10|200|190)\)|permission|permiso|OAuthException|insufficient/i.test(String(error?.message || ''));
// Palabras que pueden acompañar al Amén sin que deje de ser "solo un Amén".
const ACOMPANAN = new Set(['amen', 'aleluya', 'gloria', 'a', 'al', 'dios', 'senor', 'jesus', 'cristo', 'gracias', 'padre', 'y', 'rey',
  'de', 'reyes', 'bendito', 'bendita', 'sea', 'asi', 'tu', 'su', 'el', 'mi', 'nombre', 'hermosa', 'bella', 'oracion', 'hecho', 'esta', 'yeshua']);

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿Es solo un Amén? (con emojis, signos y alguna alabanza corta). */
function esSoloAmen(texto) {
  const palabras = normaliza(texto).replace(/[^a-zñ\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map(p => (/^a+m+e+[nm]+$/.test(p) ? 'amen' : p));
  if (!palabras.length || palabras.length > 8 || !palabras.includes('amen')) return false;
  return palabras.every(p => ACOMPANAN.has(p));
}

// Por quién se pide oración: "mi hija", "mis hijos"… (mi → tu en la respuesta).
const FAMILIA = new Set(['familia', 'hijo', 'hija', 'hijos', 'hijas', 'mama', 'papa', 'madre', 'esposo', 'esposa', 'nieto', 'nieta',
  'nietos', 'nietas', 'hermano', 'hermana', 'hermanos', 'hermanas', 'padres', 'abuela', 'abuelo', 'sobrino', 'sobrina', 'novio', 'novia']);
const CONECTORES = new Set(['por', 'para', 'y', 'e']);
// Palabras que en un comentario suelen ir con mayúscula y NO son nombres.
const NO_NOMBRES = new Set(['bendiciones', 'bendicion', 'bendice', 'bendiga', 'bendigas', 'oracion', 'hermosa', 'linda', 'bella', 'paz',
  'salud', 'amor', 'fe', 'vida', 'siempre', 'hoy', 'todos', 'todo', 'todas', 'que', 'muchas', 'mucho', 'espiritu', 'santo', 'buenos',
  'buenas', 'dias', 'noches', 'feliz', 'bendecido', 'bendecida', 'hermanos', 'hermanas', 'amigos', 'te', 'me', 'nos', 'les', 'ti', 'mio']);

/**
 * "Amén, María" / "Amén por mi hija Ana y Carlos" → "María" / "tu hija Ana y Carlos".
 * null si el comentario trae algo más (salud, historias…) o no nombra a nadie.
 */
function porQuienOrar(texto) {
  const crudas = String(texto || '').split(/[\s,.;:!¡?¿()"“”]+/).filter(Boolean)
    .map(p => p.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  if (!crudas.length || crudas.length > 10) return null;
  const partes = [];
  let alguien = false;
  let amen = false;
  for (let i = 0; i < crudas.length; i += 1) {
    const original = crudas[i];
    const n = normaliza(original);
    if (/^a+m+e+[nm]+$/.test(n)) { amen = true; continue; }
    if ((n === 'mi' || n === 'mis') && FAMILIA.has(normaliza(crudas[i + 1] || ''))) {
      partes.push(`${n === 'mi' ? 'tu' : 'tus'} ${normaliza(crudas[i + 1]).replace('mama', 'mamá').replace('papa', 'papá')}`);
      alguien = true; i += 1; continue;
    }
    if (CONECTORES.has(n)) { if (n === 'y' || n === 'e') partes.push('y'); continue; }
    if (ACOMPANAN.has(n)) continue;
    const esNombre = /^\p{Lu}\p{Ll}{1,14}$/u.test(original) && !NO_NOMBRES.has(n) && !FAMILIA.has(n);
    if (!esNombre) return null;
    partes.push(original);
    alguien = true;
  }
  if (!amen || !alguien) return null;
  const quien = partes.join(' ').replace(/^(y\s+)+|(\s+y)+$/g, '').replace(/(\s+y)+\s+/g, ' y ').trim();
  if (!quien || quien.split(' ').length > 8) return null;
  // "tu hija Ana Carlos" → coma entre nombres sueltos seguidos de otro nombre: se deja tal cual (pocas veces pasa).
  return quien;
}

const textos = require('./textos-canal');
const respuestasNombre = () => textos.lista('amen_nombre');

const respuestas = () => textos.lista('amen_respuestas');

/** Nombre de pila solo si parece un nombre (no un @usuario ni algo raro). */
function nombreDePila(autor) {
  const primero = String(autor || '').trim().split(/\s+/)[0] || '';
  if (!/^\p{Lu}\p{Ll}{1,14}$/u.test(primero)) return '';
  return primero;
}

/** Respuesta variada (según el id) para que no sea siempre el mismo texto. */
function respuestaPara({ id, autor, texto }) {
  const byte = crypto.createHash('sha1').update(String(id)).digest()[0];
  const quien = esSoloAmen(texto) ? null : porQuienOrar(texto);
  if (quien) { const l = respuestasNombre(); return l[byte % l.length].replaceAll('{q}', quien); }
  const nombre = nombreDePila(autor);
  const l = respuestas();
  return l[byte % l.length].replaceAll('{n}', nombre ? `, ${nombre}` : '');
}

/** ¿Lo contestamos solos? Amén suelto o Amén + por quién orar. */
const seResponde = texto => esSoloAmen(texto) || Boolean(porQuienOrar(texto));

/** Próxima vuelta: entre 30 y 90 minutos (al azar). */
const proximaVuelta = (now, azar = Math.random) => new Date(now.getTime() + (30 + Math.floor(azar() * 61)) * 60000);

const reciente = (fecha, now) => now.getTime() - Date.parse(fecha) <= MAX_HORAS * 3600000;

// ---------- Lectura por red: devuelven [{ id, texto, autor, fecha }] y una función para responder ----------

/** commentThreads.list de un vídeo con los comentarios cerrados (o aún privado). */
const sinComentarios = error => (error?.errors || []).some(e => e?.reason === 'commentsDisabled')
  || /disabled comments/i.test(String(error?.message || ''));

function youtubeRed({ youtube, db }) {
  return {
    nombre: 'youtube',
    async comentarios({ now }) {
      const desde = new Date(now.getTime() - MAX_HORAS * 3600000).toISOString();
      // El de mañana ya está subido pero sigue privado hasta su hora: YouTube dice que tiene
      // los comentarios desactivados y ese error tumbaba la vuelta entera (12/10/2026).
      const videos = ((await db.getRecentPublishedForSocial?.(desde)) || [])
        .filter(v => v.youtubeId && !(Date.parse(v.publishTime) > now.getTime()));
      const lista = [];
      for (const v of videos) {
        let r;
        try {
          r = await youtube.commentThreads.list({ part: ['snippet'], videoId: v.youtubeId, order: 'time', maxResults: 50 });
        } catch (error) {
          if (sinComentarios(error)) continue; // ese vídeo no admite comentarios: los demás sí
          throw error; // cuota o permiso: lo gestiona respondeAmenes
        }
        for (const hilo of r.data?.items || []) {
          const top = hilo.snippet?.topLevelComment?.snippet || {};
          if (top.authorChannelId?.value && top.authorChannelId.value === hilo.snippet?.channelId) continue; // nuestro
          if ((hilo.snippet?.totalReplyCount || 0) > 0) continue; // ya tiene respuesta: no meterse
          lista.push({ id: hilo.id, texto: top.textOriginal || top.textDisplay, autor: top.authorDisplayName, fecha: top.publishedAt, titulo: v.title,
            url: `https://www.youtube.com/watch?v=${v.youtubeId}&lc=${hilo.id}` });
        }
      }
      return lista;
    },
    responde: ({ id, texto }) => youtube.comments.insert({ part: ['snippet'], requestBody: { snippet: { parentId: id, textOriginal: texto } } })
  };
}

async function leeJson(res, red) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) throw new Error(`${red}: ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

function instagramRed({ token, fetchImpl = fetch, version = 'v25.0' }) {
  const G = `https://graph.instagram.com/${version}`;
  const get = async (ruta, campos) => leeJson(await fetchImpl(`${G}/${ruta}?${new URLSearchParams({ ...campos, access_token: token })}`), 'Instagram');
  return {
    nombre: 'instagram',
    async comentarios() {
      const yo = (await get('me', { fields: 'username' })).username;
      const medios = (await get('me/media', { fields: 'id,comments_count,caption', limit: '10' })).data || []; // 10: cabe en el límite de llamadas cada 5 min
      const lista = [];
      for (const m of medios.filter(x => x.comments_count > 0)) {
        const cs = (await get(`${m.id}/comments`, { fields: 'id,text,username,timestamp,replies{username}', limit: '50' })).data || [];
        for (const c of cs) {
          if (c.username === yo || (c.replies?.data || []).some(r => r.username === yo)) continue;
          lista.push({ id: c.id, texto: c.text, autor: '', usuario: c.username, fecha: c.timestamp, titulo: String(m.caption || '').split('\n')[0] }); // usuario = @handle: sin nombre
        }
      }
      return lista;
    },
    responde: async ({ id, texto }) => leeJson(await fetchImpl(`${G}/${id}/replies`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: texto, access_token: token }).toString()
    }), 'Instagram')
  };
}

function facebookRed({ config, fetchImpl = fetch }) {
  const G = `https://graph.facebook.com/${config.version}`;
  return {
    nombre: 'facebook',
    async comentarios() {
      const campos = 'id,message,comments.limit(50){id,message,from,created_time,comment_count}';
      const r = await leeJson(await fetchImpl(`${G}/${config.pageId}/feed?${new URLSearchParams({ fields: campos, limit: '15', access_token: config.token })}`), 'Facebook');
      const lista = [];
      for (const post of r.data || []) {
        for (const c of post.comments?.data || []) {
          if (c.from?.id === config.pageId || (c.comment_count || 0) > 0) continue;
          lista.push({ id: c.id, texto: c.message, autor: c.from?.name, fecha: c.created_time, titulo: String(post.message || '').split('\n')[0] });
        }
      }
      return lista;
    },
    responde: async ({ id, texto }) => leeJson(await fetchImpl(`${G}/${id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: texto, access_token: config.token }).toString()
    }), 'Facebook')
  };
}

/**
 * Una vuelta: busca Amén sin contestar en cada red y los responde (con topes).
 * Con `escritor` (utils/respuesta-ia.js), los demás comentarios cristianos se
 * contestan con IA; comentarios_ia_enabled='false' lo apaga (07/10/2026).
 */
async function respondeAmenes({ db, redes, logger, now = new Date(), azar = Math.random, escritor = null }) {
  if (await db.getSetting('amen_auto_enabled') === 'false') return { respondidos: 0 };
  const proxima = await db.getSetting('amen_proxima');
  if (proxima && Date.parse(proxima) > now.getTime()) return { respondidos: 0, espera: proxima };
  await db.setSetting('amen_proxima', proximaVuelta(now, azar).toISOString());
  const hoy = now.toISOString().slice(0, 10);
  const dia = JSON.parse(await db.getSetting('amen_dia') || '{}');
  let cuenta = dia.fecha === hoy ? dia.cuenta || 0 : 0;
  const hoyPorRed = dia.fecha === hoy ? { ...(dia.porRed || {}) } : {};
  const conIa = escritor && await db.getSetting('comentarios_ia_enabled') !== 'false';
  const { esCandidato } = require('./respuesta-ia');
  const hechos = JSON.parse(await db.getSetting('amen_respondidos') || '[]');
  const ya = new Set(hechos);
  const nuevos = [];
  const descartados = []; // la IA decidió no contestar: no se le vuelve a preguntar
  const vistos = []; // para el panel: qué se contestó
  const porRed = {};
  const errores = {};

  const cuota = require('./cuota-youtube');
  // Sin permiso no se arregla solo: la red descansa PAUSA_PERMISO en vez de fallar cada vuelta (07/10/2026).
  const pausas = JSON.parse(await db.getSetting('amen_pausas') || '{}');
  let pausasCambian = false;
  for (const red of redes) {
    porRed[red.nombre] = 0;
    if (red.nombre === 'youtube' && await cuota.agotada(db, now)) { errores.youtube = 'Cuota diaria de YouTube agotada: se reintenta cuando se renueve'; continue; }
    const pausa = pausas[red.nombre];
    if (pausa && Date.parse(pausa.hasta) > now.getTime()) { errores[red.nombre] = pausa.error; continue; }
    let lista = [];
    try {
      lista = await red.comentarios({ now });
      if (pausa) { delete pausas[red.nombre]; pausasCambian = true; }
    } catch (error) {
      if (red.nombre === 'youtube' && cuota.esCuota(error)) await cuota.marcaAgotada(db, now);
      const sinPermiso = esDePermiso(error);
      logger?.warn?.(`Amén automático (${red.nombre}): no se pudieron leer los comentarios: ${error.message}${sinPermiso ? ' (se reintenta en 6 h)' : ''}`);
      errores[red.nombre] = error.message;
      if (sinPermiso) {
        pausas[red.nombre] = { hasta: new Date(now.getTime() + PAUSA_PERMISO_MS).toISOString(), error: error.message };
        pausasCambian = true;
      }
      continue;
    }
    let conIaEnVuelta = 0;
    for (const c of lista) {
      if (cuenta >= TOPE_DIARIO || porRed[red.nombre] >= TOPE_POR_VUELTA) break;
      if ((hoyPorRed[red.nombre] || 0) >= (TOPES_RED[red.nombre] ?? Infinity)) break;
      const clave = `${red.nombre}:${c.id}`;
      if (ya.has(clave) || !c.fecha || !reciente(c.fecha, now)) continue;
      let respuesta = null;
      if (seResponde(c.texto)) {
        respuesta = respuestaPara(c);
      } else if (conIa && conIaEnVuelta < TOPE_IA_POR_VUELTA && esCandidato(c.texto)) {
        conIaEnVuelta += 1;
        respuesta = await escritor({ texto: c.texto, titulo: c.titulo, red: red.nombre });
        if (!respuesta) { ya.add(clave); descartados.push(clave); continue; }
      } else {
        continue;
      }
      try {
        await red.responde({ id: c.id, texto: respuesta });
        vistos.push({ red: red.nombre, comentario: String(c.texto || '').slice(0, 140), respuesta, url: c.url || null, at: now.toISOString() });
        ya.add(clave);
        nuevos.push(clave);
        cuenta += 1;
        porRed[red.nombre] += 1;
        hoyPorRed[red.nombre] = (hoyPorRed[red.nombre] || 0) + 1;
      } catch (error) {
        if (red.nombre === 'youtube' && cuota.esCuota(error)) await cuota.marcaAgotada(db, now);
        logger?.warn?.(`Amén automático (${red.nombre}): no se pudo responder: ${error.message}`);
        break; // si falla una (permiso, cuota), no insistir en esta red hasta la próxima vuelta
      }
    }
  }
  if (nuevos.length || descartados.length) {
    await db.setSetting('amen_respondidos', JSON.stringify([...nuevos, ...descartados, ...hechos].slice(0, MAX_IDS)));
  }
  if (nuevos.length) {
    await db.setSetting('amen_dia', JSON.stringify({ fecha: hoy, cuenta, porRed: hoyPorRed }));
    const antes = JSON.parse(await db.getSetting('amen_ultimas') || '[]');
    await db.setSetting('amen_ultimas', JSON.stringify([...vistos.reverse(), ...antes].slice(0, 40)));
    logger?.info?.(`Amén automático: ${nuevos.length} respuestas (${Object.entries(porRed).map(([r, n]) => `${r} ${n}`).join(', ')})`);
  }
  if (pausasCambian) await db.setSetting('amen_pausas', JSON.stringify(pausas));
  await db.setSetting('amen_redes', JSON.stringify({ at: now.toISOString(), redes: redes.map(r => r.nombre), errores }));
  return { respondidos: nuevos.length, porRed };
}

module.exports = { porQuienOrar, seResponde, proximaVuelta, esSoloAmen, respuestaPara, nombreDePila, youtubeRed, instagramRed, facebookRed, respondeAmenes };
Object.defineProperty(module.exports, 'RESPUESTAS', { get: respuestas, enumerable: true });
