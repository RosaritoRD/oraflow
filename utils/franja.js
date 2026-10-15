/**
 * La franja del día (mañana / tarde / noche) la manda el CONTENIDO.
 *
 * 27/09/2026: el guion "Oración corta de la noche para entregar todo a Dios y
 * dormir en paz" ("Antes de cerrar los ojos…") se publicó como "ORACIÓN DE LA
 * MAÑANA — DOMINGO 27…" porque TITLE_FORMULA lleva "ORACIÓN DE LA MAÑANA" fijo.
 * La miniatura (que sale del tema) decía NOCHE: título, miniatura y audio no
 * cuadraban, y la miniatura es lo que trae suscriptores. Ya había pasado el 24/09.
 *
 * Regla: el título se corrige a la franja del guion, nunca al revés.
 */

function franjaDe(texto = '') {
  const t = String(texto || '');
  if (/noche|dormir|nocturn/i.test(t)) return 'NOCHE';
  if (/\btarde\b/i.test(t)) return 'TARDE';
  if (/mañana|matutin|amanecer/i.test(t)) return 'MAÑANA';
  return null;
}

/** Franja del contenido: el título del guion, si no el tema de la estrategia. */
function franjaDelContenido(script = {}, strategy = {}) {
  // strategy.franja = la del hueco en que se publica (04:00 → MAÑANA, 18:30 → NOCHE).
  return franjaDe(script?.title) || strategy?.franja || franjaDe(strategy?.topic) || null;
}

/** Cambia "ORACIÓN DE LA <X>" del título a la franja del contenido. Sin franja, no toca nada. */
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
