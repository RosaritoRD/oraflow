/**
 * Animated «Video elements» cards (03/10/2026), same style as the subscribe
 * animation: a 1920x1080 SVG frame with a transparent background. Top center,
 * where they don't cover the captions.
 *   svgCampana(t)          4.5 s: comes in, the bell swings, goes away.
 *   svgComentar(t, texto)  5 s: comes in with a comment bubble, goes away.
 */
const W = 1920, H = 1080;
const ROJO = '#E3262E', DORADO = '#E6C27A';
const CARD = { cx: 960, cy: 230, w: 980, h: 150 };

const ease = t => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const escapa = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/*
 * Estimated width (~0.78 em per capital letter in DejaVu Sans Bold). If it went past the slot,
 * textLength shrinks it: it never spills off the card.
 */
const HUECO = 740;
const ajusta = (texto, tam) => ([...String(texto)].length * tam * 0.78 > HUECO ? ` textLength="${HUECO}" lengthAdjust="spacingAndGlyphs"` : '');

function marco(t, total, icono, linea1, linea2, tam1 = 50, tam2 = 32, blanca2 = false) {
  const op = ease(t / 0.4) * (t > total - 0.5 ? 1 - ease((t - (total - 0.5)) / 0.5) : 1);
  const dy = (1 - ease(t / 0.4)) * -40;
  const x = CARD.cx - CARD.w / 2, y = CARD.cy - CARD.h / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.45"/></filter></defs>
  <g opacity="${op.toFixed(3)}" transform="translate(0 ${dy.toFixed(1)})">
    <rect x="${x}" y="${y}" width="${CARD.w}" height="${CARD.h}" rx="28" fill="#140F0A" fill-opacity="0.82" stroke="${DORADO}" stroke-width="3" filter="url(#s)"/>
    <g transform="translate(${x + 95} ${CARD.cy})">${icono}</g>
    <text x="${x + 185}" y="${CARD.cy - 8}" font-family="DejaVu Sans" font-weight="bold" font-size="${tam1}" fill="#FFFFFF"${ajusta(linea1, tam1)}>${escapa(linea1)}</text>
    <text x="${x + 187}" y="${CARD.cy + 44}" font-family="DejaVu Sans"${blanca2 ? ' font-weight="bold"' : ''} font-size="${tam2}" fill="${blanca2 ? '#FFFFFF' : DORADO}"${ajusta(linea2, tam2)}>${escapa(linea2)}</text>
  </g></svg>`;
}

function svgCampana(t) {
  // Balanceo amortiguado entre 0,5 y 2 s.
  const a = t >= 0.5 && t <= 2 ? 22 * Math.sin((t - 0.5) * 14) * (1 - (t - 0.5) / 1.5) : 0;
  const icono = `<circle r="56" fill="${ROJO}"/>
    <g transform="rotate(${a.toFixed(2)} 0 -30)"><path d="M0 -32c-13 0 -21 10 -21 22v13l-8 10v4h58v-4l-8 -10v-13c0 -12 -8 -22 -21 -22z" fill="#fff"/>
    <path d="M-9 21a9 9 0 0 0 18 0z" fill="#fff"/></g>`;
  return marco(t, 4.5, icono, 'ACTIVA LA CAMPANA', 'para recibir cada nueva oración');
}

function svgComentar(t, texto = 'Escribe AMÉN en los comentarios') {
  const p = 1 + (t >= 0.6 && t < 1.0 ? 0.12 * Math.sin(((t - 0.6) / 0.4) * Math.PI) : 0);
  const icono = `<g transform="scale(${p.toFixed(3)})"><circle r="56" fill="${DORADO}"/>
    <path d="M-30 -22h60a8 8 0 0 1 8 8v28a8 8 0 0 1 -8 8h-30l-18 14v-14h-12a8 8 0 0 1 -8 -8v-28a8 8 0 0 1 8 -8z" fill="#140F0A"/>
    <circle cx="-14" cy="0" r="5" fill="${DORADO}"/><circle cx="0" cy="0" r="5" fill="${DORADO}"/><circle cx="14" cy="0" r="5" fill="${DORADO}"/></g>`;
  const linea = String(texto).toLocaleUpperCase('es');
  const tamDe = l => Math.max(30, Math.min(50, Math.floor(HUECO / (Math.max(1, [...l].length) * 0.78))));
  if ([...linea].length <= 30) return marco(t, 5, icono, linea, 'Tu oración también cuenta', tamDe(linea));
  // Long: on two lines, split at the word closest to the middle.
  const palabras = linea.split(' ');
  let corte = 1, mejor = Infinity;
  for (let i = 1; i < palabras.length; i++) {
    const d = Math.abs(palabras.slice(0, i).join(' ').length - palabras.slice(i).join(' ').length);
    if (d < mejor) { mejor = d; corte = i; }
  }
  const [a, b] = [palabras.slice(0, corte).join(' '), palabras.slice(corte).join(' ')];
  const tam = Math.min(42, tamDe(a.length > b.length ? a : b));
  return marco(t, 5, icono, a, b, tam, tam, true);
}

function svgCompartir(t) {
  // The share arrow «jumps» once on entry.
  const dx = t >= 0.6 && t < 1.1 ? 10 * Math.sin(((t - 0.6) / 0.5) * Math.PI) : 0;
  const icono = `<circle r="56" fill="#2E7D5B"/>
    <g transform="translate(${dx.toFixed(1)} 0)"><path d="M-30 22c4 -26 22 -38 44 -38v-14l26 24l-26 24v-14c-18 0 -32 6 -44 18z" fill="#fff"/></g>`;
  return marco(t, 4.5, icono, 'COMPARTE ESTA ORACIÓN', 'con alguien que la necesite hoy');
}

module.exports = { svgCampana, svgComentar, svgCompartir };
