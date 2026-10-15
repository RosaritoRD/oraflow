/**
 * Posts de comunidad: la frase corta sobre papel o pared, en tipografía de
 * máquina de escribir, que en este nicho hace más comentarios que los vídeos
 * (8-13 mil likes y 200-466 comentarios por post en los canales grandes).
 *
 * Formato: cuadrado 1080×1080, texto NEGRO en mayúsculas sobre fondo claro con
 * textura, 2-3 líneas cortas, y la marca del canal pequeña abajo.
 */
const path = require('path');
const fs = require('fs').promises;

// Texturas claras: nada de fotos con motivo, solo superficie.
const TEXTURAS = [
  'white concrete wall texture',
  'crumpled white paper texture',
  'light gray stone wall texture',
  'old paper page texture',
  'plain white wall background'
];

// Cuando no hay banco de imágenes: papel hecho a mano con grano y manchas.
function papelSvg(width, height, semilla = 1) {
  const tonos = [['#f4f2ee', '#e8e5df'], ['#f6f5f2', '#eae7e0'], ['#f2f0ec', '#e4e1d9']];
  const [claro, oscuro] = tonos[semilla % tonos.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stop-color="${claro}"/><stop offset="100%" stop-color="${oscuro}"/>
      </linearGradient>
      <filter id="grano">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" seed="${semilla}"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.13"/></feComponentTransfer>
      </filter>
      <radialGradient id="sombra" cx="0.5" cy="0.45" r="0.75">
        <stop offset="60%" stop-color="#000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#3a3630" stop-opacity="0.16"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#base)"/>
    <rect width="${width}" height="${height}" filter="url(#grano)"/>
    <rect width="${width}" height="${height}" fill="url(#sombra)"/>
  </svg>`;
}

function escapa(texto) {
  return String(texto ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Parte la frase en 2-3 líneas cortas, cortando por puntos cuando se puede. */
function reparte(frase, maximo = 19) {
  const limpio = String(frase || '').trim().replace(/\s+/g, ' ');
  const porPunto = limpio.split(/(?<=\.)\s+/).filter(Boolean);
  const partes = porPunto.length >= 2 && porPunto.every(p => p.length <= maximo + 8) ? porPunto : [limpio];

  const lineas = [];
  for (const parte of partes) {
    let actual = '';
    for (const palabra of parte.split(' ')) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (prueba.length > maximo && actual) { lineas.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) lineas.push(actual);
  }
  return lineas.slice(0, 4);
}

/**
 * SVG del texto sobre el fondo. Tipografía de máquina: en el contenedor está
 * "Courier 10 Pitch", que es la que da ese aire de papel escrito.
 */
function textoSvg(frase, { width = 1080, height = 1080, marca = '' } = {}) {
  const lineas = reparte(frase);
  const cuerpo = lineas.length >= 4 ? Math.round(width * 0.048)
    : lineas.length === 3 ? Math.round(width * 0.055)
      : Math.round(width * 0.062);
  const alto = Math.round(cuerpo * 1.65);
  const inicio = Math.round(height / 2 - ((lineas.length - 1) * alto) / 2 - height * 0.02);

  const textos = lineas.map((linea, i) =>
    `<text x="${width / 2}" y="${inicio + i * alto}" class="frase">${escapa(linea.toUpperCase())}</text>`
  ).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>
      /* 'Special Elite' es una máquina de escribir de verdad, con la tinta
         irregular; sin ella el post parece hecho en un procesador de textos.
         Se instala desde data/assets/fuentes/. */
      .frase { font-family: 'Special Elite', 'Courier Prime', 'Courier 10 Pitch', 'Liberation Mono', monospace;
               font-size: ${cuerpo}px; fill: #1f1c19; text-anchor: middle;
               letter-spacing: ${Math.round(cuerpo * 0.05)}px; }
      .marca { font-family: 'Special Elite', 'Courier Prime', 'Liberation Mono', monospace;
               font-size: ${Math.round(width * 0.019)}px; fill: #1f1c19; fill-opacity: 0.22;
               text-anchor: middle; letter-spacing: ${Math.round(width * 0.006)}px; }
    </style>
    ${textos}
    ${marca ? `<text x="${width / 2}" y="${Math.round(height * 0.88)}" class="marca">©${escapa(marca.toUpperCase())}</text>` : ''}
  </svg>`;
}

/**
 * Pide las frases a la IA. Cortas, en español, sin comillas ni emojis: el post
 * vive de que la frase se lea de un vistazo.
 */
async function generaFrases(aiTextService, cantidad = 5, contexto = {}) {
  if (!aiTextService?.isAvailable?.()) return [];
  const prompt = `Escribe ${cantidad} frases para posts de la comunidad de un canal de oración en español.
Reglas:
- Entre 4 y 12 palabras cada una. Se leen de un vistazo.
- Tono: esperanza, calma, confianza en Dios. Nunca promesas de dinero, salud ni milagros concretos.
- En segunda persona ("tú"), como un recordatorio, no como un sermón.
- Sin emojis, sin comillas, sin hashtags, sin numerarlas.
- Pueden ser dos frases cortas seguidas: "Da un paso. Dios guiará el siguiente."
${contexto.audiencia ? `- Público: ${contexto.audiencia}` : ''}
Devuelve SOLO un JSON: {"frases":["...","..."]}`;
  try {
    const respuesta = await aiTextService.generateText(prompt, { maxTokens: 700 });
    const limpio = String(respuesta).replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
    const datos = JSON.parse(limpio);
    return (Array.isArray(datos.frases) ? datos.frases : [])
      .map(f => String(f).trim().replace(/^["“”']|["“”']$/g, ''))
      .filter(f => f.split(/\s+/).length >= 3 && f.length <= 120);
  } catch {
    return [];
  }
}

/**
 * Compone un post. `fondo` es una imagen de textura opcional; si no hay, se
 * dibuja papel.
 * @returns {Promise<string>} ruta del PNG
 */
async function generaPost(frase, { sharp, fondo = null, salida, width = 1080, height = 1080, marca = process.env.CHANNEL_NAME || '', semilla = 1 } = {}) {
  const base = fondo
    ? await sharp(fondo).resize(width, height, { fit: 'cover' })
        .modulate({ brightness: 1.12, saturation: 0.25 })   // la textura no compite con el texto
        .toBuffer()
    : await sharp(Buffer.from(papelSvg(width, height, semilla))).png().toBuffer();

  await fs.mkdir(path.dirname(salida), { recursive: true });
  await sharp(base)
    .composite([{ input: Buffer.from(textoSvg(frase, { width, height, marca })), left: 0, top: 0 }])
    .png()
    .toFile(salida);
  return salida;
}

module.exports = { generaPost, generaFrases, textoSvg, papelSvg, reparte, TEXTURAS };
