/**
 * The time of day (morning / afternoon / night) is set by the CONTENT.
 *
 * 27/09/2026: the script "Oración corta de la noche para entregar todo a Dios y
 * dormir en paz" ("Antes de cerrar los ojos…") was published as "ORACIÓN DE LA MAÑANA
 * — DOMINGO 27…" because TITLE_FORMULA has "ORACIÓN DE LA MAÑANA" hardcoded. The
 * thumbnail (which comes from the topic) said NIGHT: title, thumbnail and audio
 * didn't match, and the thumbnail is what brings subscribers. It had already happened
 * on 24/09.
 *
 * Rule: the title is corrected to the script's time of day, never the other way
 * round.
 */

function franjaDe(texto = '') {
  const t = String(texto || '');
  if (/noche|dormir|nocturn/i.test(t)) return 'NOCHE';
  if (/\btarde\b/i.test(t)) return 'TARDE';
  if (/mañana|matutin|amanecer/i.test(t)) return 'MAÑANA';
  return null;
}

/** The content's time of day: the script's title, otherwise the strategy's topic. */
function franjaDelContenido(script = {}, strategy = {}) {
  // strategy.franja = the one of the slot it's published in (04:00 → MORNING, 18:30 → NIGHT).
  return franjaDe(script?.title) || strategy?.franja || franjaDe(strategy?.topic) || null;
}

/** Changes the title's "ORACIÓN DE LA <X>" to the content's time of day. Without one, it touches nothing. */
function corrigeFranja(titulo = '', franja = null) {
  const t = String(titulo || '');
  if (!franja) return t;
  return t.replace(/ORACI[ÓO]N\s+DE\s+LA\s+(MAÑANA|MANANA|TARDE|NOCHE)/gi, (m) => {
    const mayus = m === m.toUpperCase();
    const nueva = `ORACIÓN DE LA ${franja}`;
    return mayus ? nueva : nueva.charAt(0) + nueva.slice(1).toLowerCase();
  });
}

module.exports = { franjaDe, franjaDelContenido, corrigeFranja };
