/**
 * Thumbnail and cover with the design from the owner's reference (11/10/2026):
 *   «Oración»   Cinzel Black, silvery white with relief
 *   «PODEROSA»  Cinzel Black, metallic gold with relief
 *   «para hoy»  Playfair Display, between two gold rules
 *   seal at the bottom: crown + «ORACIONES EN PRESENCIA DE» + «YESHUA» in gold
 * Compositions:
 *   centro     16:9, text centered at the top (backgrounds with clear sky, _centro.json)
 *   izquierda  16:9, text in the left column (backgrounds with the subject on the right)
 *   vertical   9:16, Short cover (clear sky at the top)
 * The text is measured by rendering it (sharp + trim), so it never spills off the canvas.
 */
const fs = require('fs').promises;
const path = require('path');

const FORMATOS = {
  largo: { W: 3840, H: 2160 },
  short: { W: 2160, H: 3840 }
};
// YouTube API cap for thumbnails.set.
const MAX_BYTES_YOUTUBE = 2 * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const FUENTE = {
  grande: "font-family=\"Cinzel, 'Cinzel Black', 'DejaVu Serif', serif\" font-weight=\"900\"",
  pequena: "font-family=\"'Playfair Display', 'DejaVu Serif', serif\" font-weight=\"800\"",
  sello: "font-family=\"Cinzel, 'DejaVu Serif', serif\" font-weight=\"700\""
};

/** Real width (px) of `texto` at a 100 px body size with that font. */
async function anchoA100(sharp, texto, fuente) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(400, texto.length * 140)}" height="200">
<rect width="100%" height="100%" fill="#000"/><text x="20" y="140" font-size="100" ${fuente} fill="#fff">${esc(texto)}</text></svg>`;
  try {
    const { info } = await sharp(Buffer.from(svg)).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
    return info.width || texto.length * 70;
  } catch { return texto.length * 70; }
}

/** Body size that fits in `ancho`, without going over `maximo`. */
async function cuerpo(sharp, texto, fuente, ancho, maximo) {
  const a = await anchoA100(sharp, texto, fuente);
  return { size: Math.floor(Math.min(maximo, (ancho / a) * 100)), ancho: (a / 100) };
}

/** Measurements for each composition, as fractions of the canvas. */
function medidas(layout, W, H) {
  if (layout === 'vertical') {
    return { cx: W / 2, ancho: W * 0.86, top: H * 0.115, max: [H * 0.115, H * 0.125, H * 0.048], filete: W * 0.12 };
  }
  if (layout === 'izquierda') {
    return { cx: W * 0.30, ancho: W * 0.50, top: H * 0.17, max: [H * 0.21, H * 0.23, H * 0.085], filete: W * 0.07 };
  }
  return { cx: W / 2, ancho: W * 0.80, top: H * 0.05, max: [H * 0.22, H * 0.24, H * 0.09], filete: W * 0.11 };
}

/** Text with relief: an offset brown layer + a thin stroke + a gradient + a shadow. */
function textoMetal({ texto, x, y, size, relleno, fuente }) {
  const prof = Math.max(3, Math.round(size * 0.035));
  const trazo = Math.max(2, Math.round(size * 0.022));
  return `<text x="${x}" y="${y + prof}" text-anchor="middle" font-size="${size}" ${fuente} fill="#3b2405" stroke="#3b2405" stroke-width="${trazo * 2}" stroke-linejoin="round" filter="url(#sombra)">${esc(texto)}</text>
  <text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" ${fuente} fill="url(#${relleno})" stroke="#5a3a0b" stroke-width="${trazo}" stroke-linejoin="round" paint-order="stroke">${esc(texto)}</text>`;
}

function sello({ x, y, u }) {
  // Simple crown: a base + three points with pearls. `u` = size unit.
  const c = `<g transform="translate(${x - u * 1.6} ${y - u * 4.1})" fill="url(#oroH)" stroke="#5a3a0b" stroke-width="${u * 0.06}">
    <path d="M0 ${u * 1.6} L${u * 0.35} 0 L${u * 1.0} ${u * 0.95} L${u * 1.6} ${-u * 0.25} L${u * 2.2} ${u * 0.95} L${u * 2.85} 0 L${u * 3.2} ${u * 1.6} Z"/>
    <rect x="0" y="${u * 1.7}" width="${u * 3.2}" height="${u * 0.45}" rx="${u * 0.1}"/>
    <circle cx="${u * 0.35}" cy="0" r="${u * 0.22}"/><circle cx="${u * 1.6}" cy="${-u * 0.25}" r="${u * 0.25}"/><circle cx="${u * 2.85}" cy="0" r="${u * 0.22}"/>
  </g>`;
  return `<g filter="url(#sombraSello)">${c}
  <text x="${x}" y="${y - u * 0.9}" text-anchor="middle" font-size="${u * 1.05}" ${FUENTE.sello} fill="#FFF7E6" letter-spacing="${u * 0.04}">ORACIONES EN PRESENCIA DE</text>
  <text x="${x}" y="${y + u * 1.25}" text-anchor="middle" font-size="${u * 2.0}" ${FUENTE.grande} fill="url(#oro)" stroke="#5a3a0b" stroke-width="${u * 0.05}" paint-order="stroke">YESHUA</text>
  <rect x="${x - u * 9}" y="${y + u * 0.39}" width="${u * 4.6}" height="${u * 0.12}" fill="url(#fileteI)"/>
  <rect x="${x + u * 4.4}" y="${y + u * 0.39}" width="${u * 4.6}" height="${u * 0.12}" fill="url(#fileteD)"/>
  </g>`;
}

/** SVG with the headline and the seal, at the final size. */
async function miniaturaSvg({ sharp, titular, layout = 'centro', W, H, logo = null }) {
  const m = medidas(layout, W, H);
  // The trailing comma («Yeshua,») hangs over the gold line: in the image it's not needed.
  titular = { ...titular, arriba: String(titular.arriba).replace(/[,;:]\s*$/, '') };
  const [a, o, b] = await Promise.all([
    cuerpo(sharp, titular.arriba, FUENTE.grande, m.ancho, m.max[0]),
    cuerpo(sharp, titular.oro, FUENTE.grande, m.ancho, m.max[1]),
    titular.abajo ? cuerpo(sharp, titular.abajo, FUENTE.pequena, m.ancho - m.filete * 2.4, m.max[2]) : { size: 0, ancho: 0 }
  ]);
  // Cinzel: cap height ≈ 0.72 of the body size; that's what it's stacked by.
  let y = m.top + a.size * 0.78;
  const piezas = [textoMetal({ texto: titular.arriba, x: m.cx, y, size: a.size, relleno: 'plata', fuente: FUENTE.grande })];
  y += o.size * 0.98;
  piezas.push(textoMetal({ texto: titular.oro, x: m.cx, y, size: o.size, relleno: 'oro', fuente: FUENTE.grande }));
  if (titular.abajo) {
    y += b.size * 1.25;
    const medio = (b.ancho * b.size) / 2 + b.size * 0.45;
    const fy = y - b.size * 0.3;
    // Rectangles and not <line>: a gradient on a horizontal line (height 0) doesn't get painted.
    const g = Math.max(4, b.size * 0.06);
    piezas.push(`<rect x="${m.cx - medio - m.filete}" y="${fy - g / 2}" width="${m.filete}" height="${g}" fill="url(#fileteI)" filter="url(#sombra)"/>
    <rect x="${m.cx + medio}" y="${fy - g / 2}" width="${m.filete}" height="${g}" fill="url(#fileteD)" filter="url(#sombra)"/>
    <text x="${m.cx}" y="${y}" text-anchor="middle" font-size="${b.size}" ${FUENTE.pequena} fill="url(#plata)" stroke="#3b2405" stroke-width="${Math.max(2, b.size * 0.03)}" paint-order="stroke" filter="url(#sombra)">${esc(titular.abajo)}</text>`);
  }
  const finTexto = y + Math.max(b.size, o.size * 0.3) * 0.4;

  const u = layout === 'vertical' ? W * 0.026 : W * 0.0115;
  const posSello = layout === 'vertical' ? { x: W / 2, y: H * 0.93 }
    : { x: W * 0.84, y: H * 0.90 }; // The owner: the small mark bottom-right

  // Soft darkening only where the text goes, so it reads over any sky.
  const velo = layout === 'izquierda'
    ? `<linearGradient id="velo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0b0f1c" stop-opacity="0.82"/><stop offset="0.45" stop-color="#0b0f1c" stop-opacity="0.6"/><stop offset="0.68" stop-color="#0b0f1c" stop-opacity="0"/></linearGradient>`
    : `<linearGradient id="velo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1424" stop-opacity="0.55"/><stop offset="${Math.min(0.9, (finTexto / H) * 0.9).toFixed(2)}" stop-color="#0b1424" stop-opacity="0.32"/><stop offset="${Math.min(0.98, (finTexto / H) + 0.12).toFixed(2)}" stop-color="#0b1424" stop-opacity="0"/></linearGradient>`;
  const sombraSello = `<radialGradient id="baseSello" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#0b0f1c" stop-opacity="0.6"/><stop offset="1" stop-color="#0b0f1c" stop-opacity="0"/></radialGradient>`;
  const r = (logo && layout === 'vertical') ? W * 0.06 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="plata" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#F6F2EA"/><stop offset="0.58" stop-color="#CFC6B4"/><stop offset="1" stop-color="#FFFDF7"/></linearGradient>
    <linearGradient id="oro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6C4"/><stop offset="0.38" stop-color="#F8D35A"/><stop offset="0.62" stop-color="#D4931E"/><stop offset="1" stop-color="#FFE38A"/></linearGradient>
    <linearGradient id="oroH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C8891B"/><stop offset="0.5" stop-color="#FFE38A"/><stop offset="1" stop-color="#C8891B"/></linearGradient>
    <linearGradient id="fileteI" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F8D35A" stop-opacity="0"/><stop offset="1" stop-color="#FFE38A"/></linearGradient>
    <linearGradient id="fileteD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE38A"/><stop offset="1" stop-color="#F8D35A" stop-opacity="0"/></linearGradient>
    ${velo}${sombraSello}
    <filter id="sombra" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="${Math.round(H * 0.006)}" stdDeviation="${Math.round(H * 0.008)}" flood-color="#120a02" flood-opacity="0.85"/></filter>
    <filter id="sombraSello" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="${Math.round(u * 0.12)}" stdDeviation="${Math.round(u * 0.25)}" flood-color="#000" flood-opacity="0.8"/></filter>
    ${r ? `<clipPath id="circulo"><circle cx="${W / 2}" cy="${H * 0.072}" r="${r}"/></clipPath>` : ''}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#velo)"/>
  ${sombraSello ? `<ellipse cx="${posSello.x}" cy="${posSello.y - u}" rx="${u * 11}" ry="${u * 4.5}" fill="url(#baseSello)"/>` : ''}
  ${r ? `<image href="${logo}" x="${W / 2 - r}" y="${H * 0.072 - r}" width="${r * 2}" height="${r * 2}" clip-path="url(#circulo)" preserveAspectRatio="xMidYMid slice"/>` : ''}
  ${piezas.join('\n  ')}
  ${sello({ ...posSello, u })}
</svg>`;
}

/** JPG under `maxBytes`: lowers the quality and, if that's not enough, the resolution. */
async function guardaJpg(sharp, buffer, salida, { W, H, maxBytes }) {
  let ultimo = null;
  for (const [ancho, q] of [[W, 90], [W, 84], [W, 78], [W, 72], [Math.round(W * 2 / 3), 86], [Math.round(W / 2), 86]]) {
    const img = sharp(buffer);
    if (ancho !== W) img.resize(ancho, Math.round((H * ancho) / W));
    ultimo = await img.jpeg({ quality: q, mozjpeg: true }).toBuffer();
    if (!maxBytes || ultimo.length <= maxBytes) break;
  }
  await fs.mkdir(path.dirname(salida), { recursive: true });
  await fs.writeFile(salida, ultimo);
  return { salida, bytes: ultimo.length };
}

/**
 * Composes a thumbnail (long) or cover (short) with `titular` {arriba, oro, abajo}.
 * @returns {Promise<{salida, bytes, layout, width, height}>}
 */
async function componeMiniaturaYeshua({ sharp, fondo, titular, formato = 'largo', layout = null, logoPath = null, salida, maxBytes = MAX_BYTES_YOUTUBE }) {
  const { W, H } = FORMATOS[formato] || FORMATOS.largo;
  const lay = formato === 'short' ? 'vertical' : (layout || 'izquierda');
  const logo = logoPath && lay === 'vertical'
    ? `data:image/png;base64,${(await sharp(logoPath).resize(512, 512).png().toBuffer()).toString('base64')}`
    : null;
  const svg = await miniaturaSvg({ sharp, titular, layout: lay, W, H, logo });
  const posicion = lay === 'izquierda' ? 'right' : lay === 'vertical' ? 'centre' : 'bottom';
  const base = fondo
    ? await sharp(fondo).resize(W, H, { fit: 'cover', position: posicion, kernel: 'lanczos3' })
      .modulate({ brightness: 1.04, saturation: 1.12 }).toBuffer()
    : await sharp({ create: { width: W, height: H, channels: 3, background: '#0F1B2D' } }).png().toBuffer();
  const imagen = await sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).png().toBuffer();
  const r = await guardaJpg(sharp, imagen, salida, { W, H, maxBytes });
  return { ...r, layout: lay, width: W, height: H };
}

module.exports = { componeMiniaturaYeshua, miniaturaSvg, medidas, FORMATOS, MAX_BYTES_YOUTUBE };
