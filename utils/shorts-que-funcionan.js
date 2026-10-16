/**
 * The channel's Shorts with the most views in their first week (12/10/2026).
 *
 * With 19 Shorts measured at 7 days, the ones that name a concrete situation of the
 * viewer («Oración de la noche cuando no puedes dejar de pensar» 9,624 views, «Si
 * despertaste con ansiedad, haz esta oración» 6,283) got 2-3 times more than the generic
 * ones («…para comenzar el día con paz y esperanza»). The Shorts scriptwriter sees them
 * as a SHAPE to imitate, not text to copy: the repeated-titles check stays the same. The
 * data comes from performance_snapshots (YouTube Analytics).
 */

function tituloDe(fila) {
  try {
    const seo = JSON.parse(fila.metadata || '{}')?.seo?.title;
    if (seo && String(seo).trim()) return String(seo).trim();
  } catch (_e) { /* the scheduling title is fine */ }
  return String(fila.title || '').trim();
}

/** Rows {video_id, metrics, title, metadata} → [{ titulo, vistas }] from most to least viewed. */
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

/** The scriptwriter's prompt fragment; '' without data. */
function bloqueEjemplos(ejemplos) {
  if (!Array.isArray(ejemplos) || !ejemplos.length) return '';
  return '\nShorts of THIS channel with the most views in their first week. Do not copy them or reuse their titles; '
    + 'borrow their shape: one concrete situation of the viewer, said plainly in the title and in the first sentence.\n'
    + ejemplos.map(e => `- "${e.titulo}" (${e.vistas} views in its first week)`).join('\n');
}

module.exports = { mejoresShorts, bloqueEjemplos };
