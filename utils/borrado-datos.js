/**
 * Petición de borrado por mensaje privado de Instagram (07/10/2026).
 *
 * La página https://tu-dominio.com/oraciones-data-deletion (requisito de Meta
 * para la app) promete: quien mande «BORRAR» o «DELETE» por privado a
 * @tu_cuenta deja de estar en nuestras listas. Aquí se cumple:
 *  - se quita su usuario de dm_amen_usuarios (lo único que guardamos de él),
 *  - pasa a dm_no_contactar para que la oración por privado no le vuelva a llegar,
 *  - se le confirma por privado (está dentro de la ventana de 24 h: nos acaba de escribir),
 *  - queda en borrado_solicitudes para que el autor lo vea en el panel.
 * Settings: borrado_msg_ids (mensajes ya vistos), borrado_solicitudes, borrado_estado.
 */
const GRAPH = 'https://graph.instagram.com/v25.0';
const MAX_IDS = 2000;
const CONFIRMACION = 'Listo: borramos tus datos de nuestras listas y no te volveremos a escribir por privado. '
  + 'Bendiciones. / Done: your data was deleted and we will not message you again.';

const normaliza = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Solo el pedido claro: «BORRAR», «borrar mis datos», «DELETE», «delete my data», «eliminar mis datos». */
function esPeticionDeBorrado(texto) {
  return /^(borrar|eliminar|delete|remove)( (mis|my) (datos|data))?$/.test(normaliza(texto));
}

async function leeJson(res) {
  let body = {};
  try { body = await res.json(); } catch (_e) { body = {}; }
  if (!res.ok || body.error) throw new Error(`Instagram: ${body.error?.message || `HTTP ${res.status}`}`);
  return body;
}

async function procesaBorrados({ db, token, fetchImpl = fetch, now = new Date(), logger }) {
  if (!token) return { nuevas: 0 };
  const get = async (ruta, campos) => leeJson(await fetchImpl(`${GRAPH}/${ruta}?${new URLSearchParams(campos)}`, {
    headers: { Authorization: `Bearer ${token}` }
  }));
  const vistos = JSON.parse(await db.getSetting('borrado_msg_ids') || '[]');
  const ya = new Set(vistos);
  const nuevosIds = [];
  const peticiones = [];
  try {
    const yo = (await get('me', { fields: 'username' })).username;
    const r = await get('me/conversations', { platform: 'instagram', fields: 'messages.limit(10){id,message,from,created_time}', limit: '25' });
    for (const conv of r.data || []) {
      for (const msg of conv.messages?.data || []) {
        if (!msg.id || ya.has(msg.id) || !msg.from?.username || msg.from.username === yo) continue;
        ya.add(msg.id);
        nuevosIds.push(msg.id);
        if (esPeticionDeBorrado(msg.message)) peticiones.push({ usuario: msg.from.username, igsid: msg.from.id, mensajeAt: msg.created_time || null });
      }
    }
  } catch (error) {
    const antes = JSON.parse(await db.getSetting('borrado_estado') || '{}');
    if (antes.error !== error.message) logger?.warn?.(`Borrado de datos (Instagram): ${error.message}`);
    await db.setSetting('borrado_estado', JSON.stringify({ at: now.toISOString(), error: error.message }));
    return { nuevas: 0 };
  }

  const unicas = [...new Map(peticiones.map(p => [p.usuario, p])).values()];
  if (unicas.length) {
    const quitar = new Set(unicas.map(p => p.usuario));
    const usuarios = JSON.parse(await db.getSetting('dm_amen_usuarios') || '[]');
    await db.setSetting('dm_amen_usuarios', JSON.stringify(usuarios.filter(u => !quitar.has(u))));
    const noContactar = JSON.parse(await db.getSetting('dm_no_contactar') || '[]');
    await db.setSetting('dm_no_contactar', JSON.stringify([...new Set([...noContactar, ...quitar])]));
    const solicitudes = JSON.parse(await db.getSetting('borrado_solicitudes') || '[]');
    for (const p of unicas) {
      let confirmado = false;
      try {
        await leeJson(await fetchImpl(`${GRAPH}/me/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ recipient: { id: p.igsid }, message: { text: CONFIRMACION } })
        }));
        confirmado = true;
      } catch (error) {
        logger?.warn?.(`Borrado de datos: no se pudo confirmar a @${p.usuario}: ${error.message}`);
      }
      solicitudes.unshift({ usuario: p.usuario, at: now.toISOString(), mensajeAt: p.mensajeAt, confirmado });
    }
    await db.setSetting('borrado_solicitudes', JSON.stringify(solicitudes.slice(0, 200)));
    logger?.info?.(`Borrado de datos: ${unicas.length} petición(es) atendida(s) por privado`);
  }
  if (nuevosIds.length) await db.setSetting('borrado_msg_ids', JSON.stringify([...nuevosIds, ...vistos].slice(0, MAX_IDS)));
  await db.setSetting('borrado_estado', JSON.stringify({ at: now.toISOString(), error: null }));
  return { nuevas: unicas.length };
}

module.exports = { esPeticionDeBorrado, procesaBorrados, CONFIRMACION };
