/**
 * Automatic reply to comments that are just an «Amén» (05/10/2026).
 *
 * It only replies to what is clearly an Amén ("Amén 🙏", "AMEN AMEN", "Amén, gloria a
 * Dios") or an Amén with names to pray for, which is what the posts ask for ("Amén,
 * María", "Amén por mi hija Ana"): there it replies "Hoy oramos por María…". Everything
 * else (health, questions, stories) the owner answers by hand: one word outside the list
 * and it isn't touched.
 * Pace (05/10/2026): one round every 30-90 min at random, so it doesn't look like a bot.
 * Networks: YouTube, Instagram and Facebook (Facebook needs the pages_read_user_content
 * and pages_manage_engagement permissions on the Page token).
 *
 * Settings: amen_auto_enabled ('false' turns it off), amen_respondidos (ids already
 * answered), amen_dia (daily cap), amen_proxima (when the next round is due).
 */
const crypto = require('crypto');

const TOPE_DIARIO = 150;
// Each YouTube reply uses 50 of the 10,000 daily units and each upload 1,600: with 30 a day
// there are units to spare for the 3 videos (07/10/2026).
const TOPES_RED = { youtube: 30 };
const TOPE_IA_POR_VUELTA = 10;
const TOPE_POR_VUELTA = 25;
const MAX_HORAS = 72;
const MAX_IDS = 3000;
const PAUSA_PERMISO_MS = 6 * 3600000;
// Meta/Google errors that only get fixed by granting permissions (not by retrying).
const esDePermiso = error => /\(#(10|200|190)\)|permission|permiso|OAuthException|insufficient/i.test(String(error?.message || ''));
// Words that can go with the Amén without it stopping being "just an Amén".
const ACOMPANAN = new Set(['amen', 'aleluya', 'gloria', 'a', 'al', 'dios', 'senor', 'jesus', 'cristo', 'gracias', 'padre', 'y', 'rey',
  'de', 'reyes', 'bendito', 'bendita', 'sea', 'asi', 'tu', 'su', 'el', 'mi', 'nombre', 'hermosa', 'bella', 'oracion', 'hecho', 'esta', 'yeshua']);

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Is it just an Amén? (with emojis, punctuation and some short praise). */
function esSoloAmen(texto) {
  const palabras = normaliza(texto).replace(/[^a-zñ\s]/g, ' ').split(/\s+/).filter(Boolean)
    .map(p => (/^a+m+e+[nm]+$/.test(p) ? 'amen' : p));
  if (!palabras.length || palabras.length > 8 || !palabras.includes('amen')) return false;
  return palabras.every(p => ACOMPANAN.has(p));
}

// Who the prayer is requested for: "mi hija", "mis hijos"… (mi → tu in the reply).
const FAMILIA = new Set(['familia', 'hijo', 'hija', 'hijos', 'hijas', 'mama', 'papa', 'madre', 'esposo', 'esposa', 'nieto', 'nieta',
  'nietos', 'nietas', 'hermano', 'hermana', 'hermanos', 'hermanas', 'padres', 'abuela', 'abuelo', 'sobrino', 'sobrina', 'novio', 'novia']);
const CONECTORES = new Set(['por', 'para', 'y', 'e']);
// Words that usually come capitalized in a comment and are NOT names.
const NO_NOMBRES = new Set(['bendiciones', 'bendicion', 'bendice', 'bendiga', 'bendigas', 'oracion', 'hermosa', 'linda', 'bella', 'paz',
  'salud', 'amor', 'fe', 'vida', 'siempre', 'hoy', 'todos', 'todo', 'todas', 'que', 'muchas', 'mucho', 'espiritu', 'santo', 'buenos',
  'buenas', 'dias', 'noches', 'feliz', 'bendecido', 'bendecida', 'hermanos', 'hermanas', 'amigos', 'te', 'me', 'nos', 'les', 'ti', 'mio']);

/**
 * "Amén, María" / "Amén por mi hija Ana y Carlos" → "María" / "tu hija Ana y Carlos".
 * null if the comment carries something else (health, stories…) or names nobody.
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
  // "tu hija Ana Carlos" → a comma between bare names followed by another name: left as is (rarely
  // happens).
  return quien;
}

const textos = require('./textos-canal');
const respuestasNombre = () => textos.lista('amen_nombre');

const respuestas = () => textos.lista('amen_respuestas');

/** First name only if it looks like a name (not an @user or something odd). */
function nombreDePila(autor) {
  const primero = String(autor || '').trim().split(/\s+/)[0] || '';
  if (!/^\p{Lu}\p{Ll}{1,14}$/u.test(primero)) return '';
  return primero;
}

/** Varied reply (by id) so it's not always the same text. */
function respuestaPara({ id, autor, texto }) {
  const byte = crypto.createHash('sha1').update(String(id)).digest()[0];
  const quien = esSoloAmen(texto) ? null : porQuienOrar(texto);
  if (quien) { const l = respuestasNombre(); return l[byte % l.length].replaceAll('{q}', quien); }
  const nombre = nombreDePila(autor);
  const l = respuestas();
  return l[byte % l.length].replaceAll('{n}', nombre ? `, ${nombre}` : '');
}

/** Do we answer it on our own? A bare Amén or Amén + who to pray for. */
const seResponde = texto => esSoloAmen(texto) || Boolean(porQuienOrar(texto));

/** Next round: between 30 and 90 minutes (random). */
const proximaVuelta = (now, azar = Math.random) => new Date(now.getTime() + (30 + Math.floor(azar() * 61)) * 60000);

const reciente = (fecha, now) => now.getTime() - Date.parse(fecha) <= MAX_HORAS * 3600000;

// ---------- Reading per network: they return [{ id, texto, autor, fecha }] and a function to
// reply ----------

/** commentThreads.list for a video with comments closed (or still private). */
const sinComentarios = error => (error?.errors || []).some(e => e?.reason === 'commentsDisabled')
  || /disabled comments/i.test(String(error?.message || ''));

function youtubeRed({ youtube, db }) {
  return {
    nombre: 'youtube',
    async comentarios({ now }) {
      const desde = new Date(now.getTime() - MAX_HORAS * 3600000).toISOString();
      // Tomorrow's is already uploaded but stays private until its time: YouTube says it has
      // comments disabled and that error took down the whole round (12/10/2026).
      const videos = ((await db.getRecentPublishedForSocial?.(desde)) || [])
        .filter(v => v.youtubeId && !(Date.parse(v.publishTime) > now.getTime()));
      const lista = [];
      for (const v of videos) {
        let r;
        try {
          r = await youtube.commentThreads.list({ part: ['snippet'], videoId: v.youtubeId, order: 'time', maxResults: 50 });
        } catch (error) {
          if (sinComentarios(error)) continue; // that video doesn't allow comments: the others do
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
      const medios = (await get('me/media', { fields: 'id,comments_count,caption', limit: '10' })).data || []; // 10: fits within the call limit every 5 min
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
 * One round: looks for unanswered Amén on each network and replies (with caps).
 * With `escritor` (utils/respuesta-ia.js), the other Christian comments get an AI reply;
 * comentarios_ia_enabled='false' turns it off (07/10/2026).
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
  const descartados = []; // the AI decided not to reply: it isn't asked again
  const vistos = []; // for the panel: what got answered
  const porRed = {};
  const errores = {};

  const cuota = require('./cuota-youtube');
  // No permission doesn't fix itself: the network rests PAUSA_PERMISO instead of failing every
  // round (07/10/2026).
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
      logger?.warn?.(`Automatic Amén (${red.nombre}): could not read the comments: ${error.message}${sinPermiso ? ' (retrying in 6 h)' : ''}`);
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
        logger?.warn?.(`Automatic Amén (${red.nombre}): could not reply: ${error.message}`);
        break; // if one fails (permission, quota), don't insist on this network until the next round
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
    logger?.info?.(`Automatic Amén: ${nuevos.length} replies (${Object.entries(porRed).map(([r, n]) => `${r} ${n}`).join(', ')})`);
  }
  if (pausasCambian) await db.setSetting('amen_pausas', JSON.stringify(pausas));
  await db.setSetting('amen_redes', JSON.stringify({ at: now.toISOString(), redes: redes.map(r => r.nombre), errores }));
  return { respondidos: nuevos.length, porRed };
}

module.exports = { porQuienOrar, seResponde, proximaVuelta, esSoloAmen, respuestaPara, nombreDePila, youtubeRed, instagramRed, facebookRed, respondeAmenes };
Object.defineProperty(module.exports, 'RESPUESTAS', { get: respuestas, enumerable: true });
