/**
 * Visit and click counters (05/10/2026): the book page, the Buy button, the /hoy
 * link and the links page. No cookies or personal data: just one number per day.
 * Bots (WhatsApp, Facebook, Google link previews…) don't count. Setting
 * `contadores` = { 'YYYY-MM-DD': { key: n } }, 60 days.
 */
const ROBOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|curl|wget|python|headless/i;

const diaDe = (now, tz = 'America/New_York') => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

async function cuenta(db, clave, { userAgent = '', now = new Date() } = {}) {
  if (!userAgent || ROBOT.test(userAgent)) return false;
  const c = JSON.parse(await db.getSetting('contadores') || '{}');
  const dia = diaDe(now);
  c[dia] = c[dia] || {};
  c[dia][clave] = (c[dia][clave] || 0) + 1;
  const dias = Object.keys(c).sort().slice(-60);
  await db.setSetting('contadores', JSON.stringify(Object.fromEntries(dias.map(d => [d, c[d]]))));
  return true;
}

/** { hoy: {clave: n}, semana: {clave: n} } */
async function resumen(db, now = new Date()) {
  const c = JSON.parse(await db.getSetting('contadores') || '{}');
  const hoy = diaDe(now);
  const desde = diaDe(new Date(now.getTime() - 6 * 86400000));
  const semana = {};
  for (const [dia, v] of Object.entries(c)) {
    if (dia < desde || dia > hoy) continue;
    for (const [k, n] of Object.entries(v)) semana[k] = (semana[k] || 0) + n;
  }
  return { hoy: c[hoy] || {}, semana };
}

module.exports = { ROBOT, cuenta, resumen };
