/**
 * Each dashboard user's profile and preferences (05/10/2026). The user comes
 * from oauth2-proxy (X-Forwarded-Email header, already validated by Google);
 * locally, with no header, it's "local". Stored in settings `prefs:<email>`.
 * `idioma: null` = follow the browser's language until the user picks one.
 */
const VISTAS = ['overview', 'redes', 'pipeline', 'calendar', 'shorts', 'analytics', 'engagement', 'research', 'operator', 'accounts', 'settings', 'readiness', 'docs'];
const DEFECTO = { tema: 'oscuro', idioma: null, inicio: 'overview', compacto: false };

function usuarioDe(req) {
  const correo = String(req.get?.('x-forwarded-email') || req.headers?.['x-forwarded-email'] || '').trim().toLowerCase();
  const nombre = String(req.get?.('x-forwarded-preferred-username') || req.headers?.['x-forwarded-preferred-username'] || '').trim();
  return { correo: /^[^@\s]+@[^@\s]+$/.test(correo) ? correo : 'local', nombre };
}

/** "jane.doe@x" → "Jane Doe"; initials "JD". */
function nombreVisible(correo, nombre = '') {
  if (nombre) return nombre;
  if (correo === 'local') return 'Local';
  return correo.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim().split(' ').filter(Boolean)
    .map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || correo;
}
const iniciales = n => n.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

function valida(cambios = {}) {
  const v = {};
  if (cambios.tema !== undefined) { if (!['oscuro', 'claro', 'sistema'].includes(cambios.tema)) return { error: 'Invalid theme' }; v.tema = cambios.tema; }
  if (cambios.idioma !== undefined) { if (!['es', 'en'].includes(cambios.idioma)) return { error: 'Invalid language' }; v.idioma = cambios.idioma; }
  if (cambios.inicio !== undefined) { if (!VISTAS.includes(cambios.inicio)) return { error: 'Invalid start screen' }; v.inicio = cambios.inicio; }
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
