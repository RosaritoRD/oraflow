/**
 * Perfil y preferencias de cada usuario del panel (05/10/2026). El usuario lo
 * da oauth2-proxy (cabecera X-Forwarded-Email, ya validada con Google); en
 * local, sin cabecera, es "local". Se guarda en settings `prefs:<correo>`.
 */
const VISTAS = ['overview', 'redes', 'pipeline', 'calendar', 'shorts', 'analytics', 'engagement', 'research', 'operator', 'accounts', 'settings', 'readiness', 'docs'];
const DEFECTO = { tema: 'oscuro', idioma: 'es', inicio: 'overview', compacto: false };

function usuarioDe(req) {
  const correo = String(req.get?.('x-forwarded-email') || req.headers?.['x-forwarded-email'] || '').trim().toLowerCase();
  const nombre = String(req.get?.('x-forwarded-preferred-username') || req.headers?.['x-forwarded-preferred-username'] || '').trim();
  return { correo: /^[^@\s]+@[^@\s]+$/.test(correo) ? correo : 'local', nombre };
}

/** "tu.nombre@x" → "el autor"; iniciales "ER". */
function nombreVisible(correo, nombre = '') {
  if (nombre) return nombre;
  if (correo === 'local') return 'Local';
  return correo.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().split(' ').filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || correo;
}
const iniciales = n => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

function valida(cambios = {}) {
  const v = {};
  if (cambios.tema !== undefined) { if (!['oscuro', 'claro', 'sistema'].includes(cambios.tema)) return { error: 'Tema no válido' }; v.tema = cambios.tema; }
  if (cambios.idioma !== undefined) { if (!['es', 'en'].includes(cambios.idioma)) return { error: 'Idioma no válido' }; v.idioma = cambios.idioma; }
  if (cambios.inicio !== undefined) { if (!VISTAS.includes(cambios.inicio)) return { error: 'Pantalla de inicio no válida' }; v.inicio = cambios.inicio; }
  if (cambios.compacto !== undefined) v.compacto = Boolean(cambios.compacto);
  return { valor: v };
}

async function perfil(db, req) {
  const { correo, nombre } = usuarioDe(req);
  let prefs = {};
  try { prefs = JSON.parse(await db.getSetting(`prefs:${correo}`) || '{}'); } catch (_e) { prefs = {}; }
  const visible = nombreVisible(correo, nombre);
  return { correo, nombre: visible, iniciales: iniciales(visible), prefs: { ...DEFECTO, ...prefs } };
}

async function guardaPrefs(db, req, cambios) {
  const r = valida(cambios);
  if (r.error) return r;
  const actual = await perfil(db, req);
  const prefs = { ...actual.prefs, ...r.valor };
  await db.setSetting(`prefs:${actual.correo}`, JSON.stringify(prefs));
  return { ok: true, prefs };
}

module.exports = { VISTAS, DEFECTO, usuarioDe, nombreVisible, iniciales, valida, perfil, guardaPrefs };
