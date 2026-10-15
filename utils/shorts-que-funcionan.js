/**
 * Los Shorts del canal que más vistas sacaron en su primera semana (12/10/2026).
 *
 * Con 19 Shorts medidos a 7 días, los que nombran una situación concreta del que
 * mira («Oración de la noche cuando no puedes dejar de pensar» 9.624 vistas,
 * «Si despertaste con ansiedad, haz esta oración» 6.283) sacaron 2-3 veces más que
 * los genéricos («…para comenzar el día con paz y esperanza»). El guionista de
 * Shorts los ve como FORMA a imitar, no como texto a copiar: el control de títulos
 * repetidos sigue igual. Los datos salen de performance_snapshots (YouTube Analytics).
 */

function tituloDe(fila) {
  try {
    const seo = JSON.parse(fila.metadata || '{}')?.seo?.title;
    if (seo && String(seo).trim()) return String(seo).trim();
  } catch (_e) { /* el título de la programación vale */ }
  return String(fila.title || '').trim();
}

/** Filas {video_id, metrics, title, metadata} → [{ titulo, vistas }] de más a menos vistas. */
function mejoresShorts(filas = [], n = 5) {
  const porVideo = new Map();
  for (const f of filas) {
    let vistas = 0;
    try { vistas = Number(JSON.parse(f.metrics || '{}')?.views) || 0; } catch (_e) { continue; }
    const titulo = tituloDe(f);
    if (!titulo || vistas <= 0) continue;
    const previo = porVideo.get(f.video_id);
    if (!previo || vistas > previo.vistas) porVideo.set(f.video_id, { titulo, vistas });
  }
  return [...porVideo.values()].sort((a, b) => b.vistas - a.vistas).slice(0, n);
}

/** El trozo del prompt del guionista; '' sin datos. */
function bloqueEjemplos(ejemplos) {
  if (!Array.isArray(ejemplos) || !ejemplos.length) return '';
  return '\nShorts of THIS channel with the most views in their first week. Do not copy them or reuse their titles; '
    + 'borrow their shape: one concrete situation of the viewer, said plainly in the title and in the first sentence.\n'
    + ejemplos.map(e => `- "${e.titulo}" (${e.vistas} views in its first week)`).join('\n');
}

module.exports = { mejoresShorts, bloqueEjemplos };
