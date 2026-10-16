/**
 * Video elements (requested by the owner, 03/10/2026): what's added on top of long videos and
 * when. Chosen in the panel (Settings → Video elements) and saved in the `video_extras` setting as
 * JSON:
 *   suscribir — «like · SUBSCRIBE → SUBSCRIBED · bell» animation (marca-suscribir-svg.js)
 *   campana   — «TURN ON THE BELL» card with the bell moving
 *   comentar  — card with the chosen text («Escribe AMÉN en los comentarios»)
 *   compartir — «SHARE THIS PRAYER with someone who needs it» card (off by default)
 * Moments: start (3 s into the body, 0:11 with the intro), middle, end (30 s before).
 * Shorts: only subscribe (checkbox `suscribir.shorts`), always 6 s before the end.
 * A broken setting never stops a render: the defaults are used.
 */
const TIPOS = ['suscribir', 'campana', 'comentar', 'compartir'];
const MOMENTOS = ['inicio', 'mitad', 'final'];
/** Seconds each animation lasts (the sequences run at 30 fps). */
const DURACION = Object.freeze({ suscribir: 3.5, campana: 4.5, comentar: 5, compartir: 4.5 });
const TEXTO_COMENTAR = 'Escribe AMÉN en los comentarios';
const MAX_TEXTO = 60;

const EXTRAS_POR_DEFECTO = Object.freeze({
  suscribir: { activo: true, momentos: ['inicio'], shorts: true },
  campana: { activo: true, momentos: ['mitad'] },
  comentar: { activo: true, momentos: ['final'], texto: TEXTO_COMENTAR },
  compartir: { activo: false, momentos: ['mitad'] }
});

const copia = o => JSON.parse(JSON.stringify(o));

function limpiaTexto(t) {
  const s = String(t ?? '').replace(/<[^>]*>/g, '').replace(/[<>{}\\]/g, '').replace(/\s+/g, ' ').trim();
  return s ? [...s].slice(0, MAX_TEXTO).join('').trim() : TEXTO_COMENTAR;
}

function normalizaExtras(entrada) {
  let e = entrada;
  if (typeof e === 'string') { try { e = JSON.parse(e); } catch { e = null; } }
  if (!e || typeof e !== 'object') return copia(EXTRAS_POR_DEFECTO);
  const salida = {};
  for (const tipo of TIPOS) {
    const base = EXTRAS_POR_DEFECTO[tipo];
    const v = e[tipo] && typeof e[tipo] === 'object' ? e[tipo] : base;
    const momentos = [...new Set((Array.isArray(v.momentos) ? v.momentos : base.momentos).filter(m => MOMENTOS.includes(m)))];
    salida[tipo] = { activo: v.activo === undefined ? base.activo : v.activo === true || v.activo === 'true', momentos };
    if (tipo === 'comentar') salida[tipo].texto = limpiaTexto(v.texto);
    if (tipo === 'suscribir') salida[tipo].shorts = v.shorts === undefined ? base.shorts : v.shorts === true || v.shorts === 'true';
  }
  return salida;
}

function segundoDe(momento, duracion) {
  if (momento === 'inicio') return 3;
  if (momento === 'mitad') return duracion / 2;
  return duracion - 30;
}

/** [{ tipo, inicio }] in order, staggered with 1 s of air and inside the video. */
function planDeExtras({ extras, duracion, formato = 'long' }) {
  const total = Number(duracion) || 0;
  const e = normalizaExtras(extras);
  if (formato === 'short') {
    const d = DURACION.suscribir;
    if (!e.suscribir.activo || !e.suscribir.shorts || total < d + 2) return [];
    return [{ tipo: 'suscribir', inicio: Math.round(Math.max(0, total - 6) * 100) / 100 }];
  }
  const crudo = [];
  for (const tipo of TIPOS) {
    if (!e[tipo].activo) continue;
    for (const m of e[tipo].momentos) {
      const d = DURACION[tipo];
      const inicio = Math.max(0, Math.min(segundoDe(m, total), total - d));
      crudo.push({ tipo, inicio });
    }
  }
  crudo.sort((a, b) => a.inicio - b.inicio || TIPOS.indexOf(a.tipo) - TIPOS.indexOf(b.tipo));
  const plan = [];
  for (const p of crudo) {
    const prev = plan[plan.length - 1];
    let inicio = p.inicio;
    if (prev) inicio = Math.max(inicio, prev.inicio + DURACION[prev.tipo] + 1);
    if (inicio + DURACION[p.tipo] > total) continue;
    plan.push({ tipo: p.tipo, inicio: Math.round(inicio * 100) / 100 });
  }
  return plan;
}

module.exports = { normalizaExtras, planDeExtras, EXTRAS_POR_DEFECTO, DURACION, TIPOS, MOMENTOS, TEXTO_COMENTAR };
