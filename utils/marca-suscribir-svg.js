/**
 * One frame (SVG 1920x1080, transparent background) of the in-house «like ·
 * SUBSCRIBE → SUBSCRIBED · bell» animation with a cursor that clicks them.
 * 3.5 s: appears (0-0.35), click on like (0.85), on subscribe (1.55), on the
 * bell (2.2), and fades out (3.0-3.5). Icons drawn here.
 */
const W = 1920, H = 1080, CY = 300;
const THUMB = { x: 745, y: CY }, BTN = { x: 1000, y: CY, w: 360, h: 96 }, BELL = { x: 1250, y: CY };
const ROJO = '#E3262E', GRIS = '#D9D9D9';

const ease = t => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a, b, t) => a + (b - a) * t;

function cursorPos(t) {
  const tramos = [[0.35, 0.85, { x: 1290, y: 640 }, { x: THUMB.x + 12, y: THUMB.y + 20 }],
                  [1.05, 1.55, { x: THUMB.x + 12, y: THUMB.y + 20 }, { x: BTN.x + 10, y: BTN.y + 22 }],
                  [1.75, 2.2, { x: BTN.x + 10, y: BTN.y + 22 }, { x: BELL.x + 10, y: BELL.y + 20 }]];
  if (t < 0.35) return tramos[0][2];
  for (let i = 0; i < tramos.length; i++) {
    const [a, b, p, q] = tramos[i];
    if (t < a) return tramos[i - 1][3];
    if (t <= b) { const k = ease((t - a) / (b - a)); return { x: lerp(p.x, q.x, k), y: lerp(p.y, q.y, k) }; }
  }
  return tramos[2][3];
}
const pulso = (t, c) => (t >= c && t < c + 0.18 ? 1 + 0.12 * Math.sin(((t - c) / 0.18) * Math.PI) : 1);

function svgSuscribir(t) {
  const entrada = ease(t / 0.35);
  const op = entrada * (t > 3.0 ? 1 - ease((t - 3.0) / 0.5) : 1);
  const esc = 0.85 + 0.15 * entrada;
  const suscrito = t >= 1.6, campana = t >= 2.25;
  const c = cursorPos(t);
  const clic = (t >= 0.85 && t < 1.0) || (t >= 1.55 && t < 1.7) || (t >= 2.2 && t < 2.35);
  const g = (x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${(s * esc).toFixed(4)})">${body}</g>`;
  const pulgar = `<circle r="50" fill="${ROJO}" filter="url(#s)"/>
    <path d="M-22 -4h10v26h-10z M-8 -4l12 -18c3 -4 10 -3 9 3l-2 11h14c5 0 8 4 7 8l-5 18c-1 3 -3 4 -6 4h-29z" fill="#fff"/>`;
  const boton = `<rect x="${-BTN.w / 2}" y="${-BTN.h / 2}" width="${BTN.w}" height="${BTN.h}" rx="14" fill="${suscrito ? GRIS : ROJO}" filter="url(#s)"/>
    <text x="0" y="17" text-anchor="middle" font-family="DejaVu Sans" font-weight="bold" font-size="${suscrito ? 46 : 44}" fill="${suscrito ? '#222' : '#fff'}">${suscrito ? 'SUSCRITO' : 'SUSCRÍBETE'}</text>`;
  const bell = `<circle r="46" fill="${campana ? ROJO : GRIS}" filter="url(#s)"/>
    <path d="M0 -26c-11 0 -17 8 -17 18v11l-6 8v3h46v-3l-6 -8v-11c0 -10 -6 -18 -17 -18z M-7 17a7 7 0 0 0 14 0z" fill="${campana ? '#fff' : '#555'}"/>`;
  const cursor = `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) scale(${clic ? 0.88 : 1})"><path d="M0 0 L0 42 L11 32 L19 50 L27 46 L19 29 L34 29 Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.35"/></filter></defs>
    <g opacity="${op.toFixed(3)}">${g(THUMB.x, THUMB.y, pulso(t, 0.85), pulgar)}${g(BTN.x, BTN.y, pulso(t, 1.55), boton)}${g(BELL.x, BELL.y, pulso(t, 2.2), bell)}${t >= 0.3 ? cursor : ''}</g></svg>`;
}

module.exports = { svgSuscribir };
