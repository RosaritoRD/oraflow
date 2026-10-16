/**
 * Private message to whoever comments «Amén» on Instagram (the owner, 05/10/2026).
 * IT STARTS OFF (dm_amen_enabled='true' turns it on, "for later").
 *
 * Uses Instagram's "private replies": a direct message as a reply to ONE comment, allowed
 * within 7 days of the comment (POST /me/messages with recipient.comment_id). Needs the
 * instagram_business_manage_messages permission on the token.
 *
 * First the prayer (what the person came looking for), then the book with the coupon. To
 * not look like spam: ONCE per person (not per comment), a daily cap and only comments
 * that are an Amén. No 🕊️.
 * Settings: dm_amen_enabled, dm_amen_usuarios (who was already written to), dm_amen_dia.
 */
const crypto = require('crypto');

const GRAPH = 'https://graph.instagram.com/v25.0';
const TOPE_DIARIO = 40;
const MAX_DIAS = 7;
const ESPERA_PERMISO_MS = 3600000;
const textos = require('./textos-canal');

// 40 different prayers (05/10/2026), one per topic and in two batches: anxiety,
// insomnia, family, children, health, work, debts, loneliness, grief, fear…
// All with Jesus of Nazareth as King of kings and «Amén» (reviewed when saved).
const ORACIONES = require('./oraciones-privado.json');

function textoMensaje({ id }, indice = null) {
  const i = indice ?? crypto.createHash('sha1').update(String(id)).digest().readUInt16BE(0);
  const oracion = ORACIONES[i % ORACIONES.length];
  const libro = textos.texto('privado_libro').replaceAll('{cupon}', textos.texto('cupon')).replaceAll('{libro}', textos.texto('libro_url'));
  return [textos.texto('privado_inicio'), oracion, libro, textos.texto('privado_cierre')].map(t => String(t).trim()).filter(Boolean).join('\n\n');
}

async function leeJson(res) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) throw new Error(`Instagram: ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

/** Sends the private message to whoever wrote the comment. */
async function enviaPrivado({ token, commentId, texto, fetchImpl = fetch }) {
  return leeJson(await fetchImpl(`${GRAPH}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: texto } })
  }));
}

// Public reply to the comment when the prayer is sent privately (the owner, 05/10/2026).
const avisos = () => textos.lista('aviso_privado');
const avisoPara = id => { const l = avisos(); return l[crypto.createHash('sha1').update(String(id)).digest()[0] % l.length]; };

/**
 * One round on Instagram. Since 05/10/2026 ANY comment counts (not only «Amén»): the first time
 * someone comments they get a prayer privately and, on the comment, the notice "te envié una
 * oración por DM". If they already got one and write «Amén» again, they get the usual reply
 * (`respuestaAmen`); the rest is answered by the owner.
 * `comentarios` = the ones that don't have a reply from the channel yet: [{ id, texto, usuario,
 * fecha }].
 */
async function enviaMensajesAmen({ db, token, comentarios, esAmen, respuestaAmen, responde, logger, now = new Date(), fetchImpl = fetch }) {
  if (!token || await db.getSetting('dm_amen_enabled') !== 'true') return 0;
  const hoy = now.toISOString().slice(0, 10);
  const dia = JSON.parse(await db.getSetting('dm_amen_dia') || '{}');
  let cuenta = dia.fecha === hoy ? dia.cuenta || 0 : 0;
  const usuarios = JSON.parse(await db.getSetting('dm_amen_usuarios') || '[]');
  const ya = new Set(usuarios);
  // Whoever asked to delete their data (utils/borrado-datos.js) doesn't get private messages again (07/10/2026).
  const noContactar = new Set(JSON.parse(await db.getSetting('dm_no_contactar') || '[]'));
  let fallo = null;
  const nuevos = [];
  let publicas = 0;
  // Meta rejected the private message: it's not tried again this round. If it was about permissions, it waits 1 h.
  const previo = JSON.parse(await db.getSetting('dm_amen_estado') || '{}').ultimoError;
  let privadoCaido = Boolean(previo?.at && /permission|permiso|capability|\(#(3|10|200)\)/i.test(previo.mensaje || '')
    && now.getTime() - Date.parse(previo.at) < ESPERA_PERMISO_MS);
  for (const c of comentarios) {
    if (!c.usuario || !String(c.texto || '').trim()) continue;
    if (now.getTime() - Date.parse(c.fecha) > MAX_DIAS * 86400000) continue;
    const nuevo = !ya.has(c.usuario) && !noContactar.has(c.usuario);
    if (nuevo && !privadoCaido) {
      if (cuenta >= TOPE_DIARIO) continue; // tomorrow, within the 7 days
      try {
        const turno = Number(await db.getSetting('dm_amen_turno') || 0);
        await enviaPrivado({ token, commentId: c.id, texto: textoMensaje(c, turno), fetchImpl });
        await db.setSetting('dm_amen_turno', String(turno + 1)); // the next person gets another prayer
        ya.add(c.usuario);
        nuevos.push(c.usuario);
        cuenta += 1;
        if (responde) { await responde({ id: c.id, texto: avisoPara(c.id) }); publicas += 1; }
        continue;
      } catch (error) {
        logger?.warn?.(`Instagram (private-message prayer): ${error.message}`);
        fallo = { mensaje: String(error.message).slice(0, 300), at: now.toISOString() };
        privadoCaido = true; // permission or limit: don't insist until the next round
      }
    }
    // No private message (already got it, asked not to get more, or Meta rejects it): the «Amén» is answered publicly (07/10/2026).
    if (responde && esAmen?.(c.texto) && respuestaAmen) {
      try {
        await responde({ id: c.id, texto: respuestaAmen(c) });
        publicas += 1;
      } catch (error) {
        logger?.warn?.(`Instagram (Amén reply): ${error.message}`);
        break;
      }
    }
  }
  if (nuevos.length) {
    await db.setSetting('dm_amen_usuarios', JSON.stringify([...nuevos, ...usuarios].slice(0, 5000)));
    await db.setSetting('dm_amen_dia', JSON.stringify({ fecha: hoy, cuenta }));
  }
  if (nuevos.length || fallo) {
    // For the panel (Social area): how many, when the last one was and the last error.
    const antes = JSON.parse(await db.getSetting('dm_amen_estado') || '{}');
    await db.setSetting('dm_amen_estado', JSON.stringify({
      hoy: cuenta,
      total: (antes.total || 0) + nuevos.length,
      ultimoEnvio: nuevos.length ? now.toISOString() : antes.ultimoEnvio || null,
      ultimoError: fallo || (nuevos.length ? null : antes.ultimoError || null)
    }));
  }
  if (nuevos.length || publicas) logger?.info?.(`Instagram: private-message prayer to ${nuevos.length} person(s), ${publicas} comment reply(ies)`);
  return nuevos.length;
}

module.exports = { avisoPara, ORACIONES, textoMensaje, enviaPrivado, enviaMensajesAmen };
Object.defineProperties(module.exports, {
  AVISOS: { get: avisos, enumerable: true },
  CUPON: { get: () => textos.texto('cupon'), enumerable: true },
  LIBRO: { get: () => textos.texto('libro_url'), enumerable: true }
});
