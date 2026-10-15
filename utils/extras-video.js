/**
 * Elementos del vídeo (pedido del autor, 03/10/2026): qué se añade encima de los
 * vídeos largos y cuándo. Se elige en el panel (Ajustes → Elementos del vídeo) y
 * se guarda en el ajuste `video_extras` como JSON:
 *   suscribir — animación «me gusta · SUSCRÍBETE → SUSCRITO · campana» (marca-suscribir-svg.js)
 *   campana   — tarjeta «ACTIVA LA CAMPANA» con la campana moviéndose
 *   comentar  — tarjeta con el texto que se elija («Escribe AMÉN en los comentarios»)
 *   compartir — tarjeta «COMPARTE ESTA ORACIÓN con alguien que la necesite» (apagada por defecto)
 * Momentos: inicio (a los 3 s del cuerpo, 0:11 con la intro), mitad, final (30 s antes).
 * Shorts: solo suscribirse (casilla `suscribir.shorts`), siempre a 6 s del final.
 * Un ajuste roto nunca para un render: se usan los valores por defecto.
 */
const TIPOS = ['suscribir', 'campana', 'comentar', 'compartir'];
const MOMENTOS = ['inicio', 'mitad', 'final'];
/** Segundos que dura cada animación (las secuencias van a 30 fps). */
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

/** [{ tipo, inicio }] en orden, escalonados con 1 s de aire y dentro del vídeo. */
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
