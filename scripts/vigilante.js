#!/usr/bin/env node
/**
 * Oraflow watchdog (05/10/2026): prints what's failing as JSON.
 * The host cron calls it every 15 min (a separate script), which only sends an email when a
 * problem APPEARS or is RESOLVED (not on every round).
 *
 * Born on 05/10: the OpenRouter key hit its cap in the early hours and 4 videos were lost without
 * anyone noticing until hours later.
 * Nothing here spends AI: the balance is read from /api/v1/key (free).
 */
const { Database } = require('../database/db');
const { estadoRedes } = require('../utils/redes-estado');

const SALDO_MINIMO = 0.5; // dollars left on the key before warning

async function miraIA(env = process.env, fetchImpl = fetch) {
  if (String(env.AI_TEXT_PROVIDER || '').toLowerCase() !== 'openrouter' || !env.OPENROUTER_API_KEY) return [];
  try {
    const res = await fetchImpl('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } });
    if (!res.ok) return [{ clave: 'ia', mensaje: `La clave de OpenRouter no funciona (HTTP ${res.status}). Sin IA no salen vídeos ni publicaciones.` }];
    const d = (await res.json()).data || {};
    if (d.limit !== null && d.limit !== undefined && Number(d.limit_remaining) < SALDO_MINIMO) {
      return [{ clave: 'ia', mensaje: `A la clave de OpenRouter le quedan $${Number(d.limit_remaining).toFixed(2)} de su tope de $${d.limit}. Súbele el límite en openrouter.ai → Keys.` }];
    }
    return [];
  } catch (error) {
    return [{ clave: 'ia', mensaje: `No se pudo comprobar OpenRouter: ${error.message}` }];
  }
}

async function miraVideos(db) {
  const fallidos = await db.getAllRows(
    `SELECT id, error FROM generation_jobs WHERE status = 'failed' AND updated_at >= datetime('now', '-4 hours')`
  );
  if (!fallidos.length) return [];
  const motivo = String(fallidos[0].error || '').slice(0, 160);
  return [{ clave: 'videos', mensaje: `${fallidos.length} vídeo(s) de YouTube fallaron en las últimas 4 horas. Último motivo: ${motivo}` }];
}

async function miraRedes(db, hoy) {
  const problemas = [];
  for (const p of await estadoRedes(db)) {
    if (!p.encendida || !p.ultimo || p.ultimo.fecha !== hoy || p.ultimo.estado !== 'failed') continue;
    const malas = Object.entries(p.ultimo.redes || {}).filter(([, r]) => r?.status === 'failed');
    if (!malas.length) continue;
    problemas.push({ clave: `redes:${p.id}`, mensaje: `«${p.nombre}» falló hoy en ${malas.map(([n, r]) => `${n} (${String(r.error || '').slice(0, 100)})`).join(', ')}` });
  }
  return problemas;
}

// Prayer by private message (07/10/2026): the last attempt failed and none has gone out since.
async function miraPrivado(db, now = new Date()) {
  if (await db.getSetting('dm_amen_enabled') !== 'true') return [];
  let e = {};
  try { e = JSON.parse(await db.getSetting('dm_amen_estado') || '{}'); } catch (_e) { return []; }
  const err = e.ultimoError;
  if (!err?.at || now.getTime() - Date.parse(err.at) > 86400000) return [];
  if (e.ultimoEnvio && Date.parse(e.ultimoEnvio) > Date.parse(err.at)) return [];
  return [{ clave: 'privado', mensaje: `La oración por mensaje privado de Instagram no sale: ${String(err.mensaje).slice(0, 160)}. Si habla de permisos, la app de Meta sigue sin permiso de mensajes o en modo desarrollo.` }];
}

// Instagram access lasts 60 days and is renewed every week: more than 14 without renewal = the renewal is failing.
async function miraTokenInstagram(db, now = new Date()) {
  const t = Date.parse(await db.getSetting('instagram_token_refreshed_at') || '');
  if (!Number.isFinite(t)) return [];
  const dias = Math.floor((now.getTime() - t) / 86400000);
  if (dias <= 14) return [];
  return [{ clave: 'instagram-token', mensaje: `El acceso de Instagram no se renueva desde hace ${dias} días; caduca a los 60 y entonces dejan de salir publicaciones, respuestas y privados.` }];
}

async function main() {
  const db = new Database();
  await db.initialize();
  const tz = await db.getSetting('channel_timezone') || 'America/New_York';
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const cuota = await db.getSetting('youtube_cuota_hasta');
  const sinCuota = cuota && Date.parse(cuota) > Date.now()
    ? [{ clave: 'cuota', mensaje: 'Cuota diaria de la API de YouTube agotada: las respuestas y los comentarios esperan; si no se renueva antes de la subida del día, el vídeo se retrasa.' }]
    : [];
  const problemas = [...await miraIA(), ...await miraVideos(db), ...await miraRedes(db, hoy), ...sinCuota,
    ...await miraPrivado(db), ...await miraTokenInstagram(db)];
  process.stdout.write(`${JSON.stringify({ at: new Date().toISOString(), problemas })}\n`);
}

if (require.main === module) {
  // The database logger writes to stdout: it's silenced to leave only the JSON.
  const escribe = process.stdout.write.bind(process.stdout);
  console.log = () => {};
  console.info = () => {};
  process.stdout.write = (chunk, ...rest) => (String(chunk).startsWith('{"at"') ? escribe(chunk, ...rest) : true);
  main().then(() => process.exit(0)).catch(e => { escribe(`${JSON.stringify({ error: e.message })}\n`); process.exit(1); });
}

module.exports = { miraIA, miraVideos, miraRedes, miraPrivado, miraTokenInstagram };
