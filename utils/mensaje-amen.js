/**
 * Mensaje privado a quien comenta «Amén» en Instagram (el autor, 05/10/2026).
 * ARRANCA APAGADO (dm_amen_enabled='true' lo enciende, "para más adelante").
 *
 * Usa las "respuestas privadas" de Instagram: un mensaje directo como
 * respuesta a UN comentario, permitido en los 7 días siguientes al comentario
 * (POST /me/messages con recipient.comment_id). Necesita el permiso
 * instagram_business_manage_messages en el token.
 *
 * Primero la oración (lo que la persona vino a buscar), después el libro con
 * el cupón. Para no parecer spam: UNA vez por persona (no por comentario),
 * tope diario y solo comentarios que son un Amén. Sin 🕊️.
 * Settings: dm_amen_enabled, dm_amen_usuarios (a quién ya se le escribió), dm_amen_dia.
 */
const crypto = require('crypto');

const GRAPH = 'https://graph.instagram.com/v25.0';
const TOPE_DIARIO = 40;
const MAX_DIAS = 7;
const ESPERA_PERMISO_MS = 3600000;
const textos = require('./textos-canal');

// 40 oraciones distintas (05/10/2026), una por tema y en dos tandas: ansiedad,
// insomnio, familia, hijos, salud, trabajo, deudas, soledad, duelo, miedo…
// Todas con Jesús de Nazaret como Rey de reyes y «Amén» (revisadas al guardarlas).
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

/** Envía el mensaje privado a quien escribió el comentario. */
async function enviaPrivado({ token, commentId, texto, fetchImpl = fetch }) {
  return leeJson(await fetchImpl(`${GRAPH}/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: texto } })
  }));
}

// Respuesta pública al comentario cuando se le envía la oración por privado (el autor, 05/10/2026).
const avisos = () => textos.lista('aviso_privado');
const avisoPara = id => { const l = avisos(); return l[crypto.createHash('sha1').update(String(id)).digest()[0] % l.length]; };

/**
 * Una vuelta en Instagram. Desde el 05/10/2026 vale CUALQUIER comentario (no
 * solo «Amén»): la primera vez que alguien comenta recibe una oración por
 * privado y, en el comentario, el aviso "te envié una oración por DM". Si ya
 * la recibió antes y vuelve a escribir «Amén», se le contesta como siempre
 * (`respuestaAmen`); lo demás lo contesta el autor.
 * `comentarios` = los que aún no tienen respuesta del canal: [{ id, texto, usuario, fecha }].
 */
async function enviaMensajesAmen({ db, token, comentarios, esAmen, respuestaAmen, responde, logger, now = new Date(), fetchImpl = fetch }) {
  if (!token || await db.getSetting('dm_amen_enabled') !== 'true') return 0;
  const hoy = now.toISOString().slice(0, 10);
  const dia = JSON.parse(await db.getSetting('dm_amen_dia') || '{}');
  let cuenta = dia.fecha === hoy ? dia.cuenta || 0 : 0;
  const usuarios = JSON.parse(await db.getSetting('dm_amen_usuarios') || '[]');
  const ya = new Set(usuarios);
  // Quien pidió borrar sus datos (utils/borrado-datos.js) no vuelve a recibir privados (07/10/2026).
  const noContactar = new Set(JSON.parse(await db.getSetting('dm_no_contactar') || '[]'));
  let fallo = null;
  const nuevos = [];
  let publicas = 0;
  // Meta rechazó el privado: esta vuelta ya no se intenta más. Si fue por permisos, se espera 1 h.
  const previo = JSON.parse(await db.getSetting('dm_amen_estado') || '{}').ultimoError;
  let privadoCaido = Boolean(previo?.at && /permission|permiso|capability|\(#(3|10|200)\)/i.test(previo.mensaje || '')
    && now.getTime() - Date.parse(previo.at) < ESPERA_PERMISO_MS);
  for (const c of comentarios) {
    if (!c.usuario || !String(c.texto || '').trim()) continue;
    if (now.getTime() - Date.parse(c.fecha) > MAX_DIAS * 86400000) continue;
    const nuevo = !ya.has(c.usuario) && !noContactar.has(c.usuario);
    if (nuevo && !privadoCaido) {
      if (cuenta >= TOPE_DIARIO) continue; // mañana, dentro de los 7 días
      try {
        const turno = Number(await db.getSetting('dm_amen_turno') || 0);
        await enviaPrivado({ token, commentId: c.id, texto: textoMensaje(c, turno), fetchImpl });
        await db.setSetting('dm_amen_turno', String(turno + 1)); // la siguiente persona recibe otra oración
        ya.add(c.usuario);
        nuevos.push(c.usuario);
        cuenta += 1;
        if (responde) { await responde({ id: c.id, texto: avisoPara(c.id) }); publicas += 1; }
        continue;
      } catch (error) {
        logger?.warn?.(`Instagram (oración por privado): ${error.message}`);
        fallo = { mensaje: String(error.message).slice(0, 300), at: now.toISOString() };
        privadoCaido = true; // permiso o límite: no insistir hasta la próxima vuelta
      }
    }
    // Sin privado (ya la recibió, pidió no recibir más, o Meta lo rechaza): el «Amén» se contesta en público (07/10/2026).
    if (responde && esAmen?.(c.texto) && respuestaAmen) {
      try {
        await responde({ id: c.id, texto: respuestaAmen(c) });
        publicas += 1;
      } catch (error) {
        logger?.warn?.(`Instagram (respuesta al Amén): ${error.message}`);
        break;
      }
    }
  }
  if (nuevos.length) {
    await db.setSetting('dm_amen_usuarios', JSON.stringify([...nuevos, ...usuarios].slice(0, 5000)));
    await db.setSetting('dm_amen_dia', JSON.stringify({ fecha: hoy, cuenta }));
  }
  if (nuevos.length || fallo) {
    // Para el panel (área Redes): cuántos, cuándo el último y el último error.
    const antes = JSON.parse(await db.getSetting('dm_amen_estado') || '{}');
    await db.setSetting('dm_amen_estado', JSON.stringify({
      hoy: cuenta,
      total: (antes.total || 0) + nuevos.length,
      ultimoEnvio: nuevos.length ? now.toISOString() : antes.ultimoEnvio || null,
      ultimoError: fallo || (nuevos.length ? null : antes.ultimoError || null)
    }));
  }
  if (nuevos.length || publicas) logger?.info?.(`Instagram: oración por privado a ${nuevos.length} persona(s), ${publicas} respuesta(s) en comentarios`);
  return nuevos.length;
}

module.exports = { avisoPara, ORACIONES, textoMensaje, enviaPrivado, enviaMensajesAmen };
Object.defineProperties(module.exports, {
  AVISOS: { get: avisos, enumerable: true },
  CUPON: { get: () => textos.texto('cupon'), enumerable: true },
  LIBRO: { get: () => textos.texto('libro_url'), enumerable: true }
});
