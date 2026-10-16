/**
 * Prayer carousel for Instagram (requested 04/10/2026).
 *
 * A format copied from the prayer accounts that get the most saves and shares:
 *   1. Cover with a hook that names the moment ("Para cuando el corazón no
 *      encuentra paz al llegar la noche"). ⚠ Never "no sabes orar".
 *   2-5. One prayer per slide + its verse.
 *   6. Closing: send it / save it / love / comment an Amén.
 * 1080×1350 (4:5): the format that takes up the most screen in the feed.
 *
 * ⚠ The AI writes the prayers and PICKS the reference, but the verse text comes
 * from the Reina-Valera 1909 (public domain, /shorts/biblia/rv1909.json). A
 * reference that doesn't exist is discarded: an invented verse is never drawn.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { REGLA_FE, conAmen } = require('./reglas-oracion');
const { lineaLibro } = require('./libro');

const ANCHO = 1080;
const ALTO = 1350;        // carrusel: 4:5
const ALTO_VIDEO = 1920;  // video version (Reel with music): 9:16
const MARCA = 'Oraciones en Presencia de Yeshua';
const USUARIO = '@your_account';
const BIBLIA_RUTAS = ['/shorts/biblia/rv1909.json', '/path/to/shorts/biblia/rv1909.json'];
const FUENTES = path.join(__dirname, '..', 'assets', 'fonts');

// Moments and needs people search for. They rotate so the topic doesn't repeat.
const TEMAS = [
  'antes de dormir', 'al despertar', 'cuando tienes ansiedad', 'por tu familia',
  'cuando te sientes solo', 'para pedir protección', 'cuando estás cansado',
  'para dar gracias', 'por tus hijos', 'cuando esperas un milagro',
  'para sanar el corazón', 'por tu trabajo y tus finanzas', 'cuando tienes miedo',
  'para empezar la semana', 'para perdonar', 'por tu salud'
];

const sinTildes = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let bibliaCache = null;
function cargaBiblia(rutas = BIBLIA_RUTAS) {
  if (bibliaCache) return bibliaCache;
  for (const ruta of rutas) {
    if (fs.existsSync(ruta)) {
      bibliaCache = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      return bibliaCache;
    }
  }
  throw new Error('RV1909 Bible not found (rv1909.json)');
}

/** "Salmo 4:8", "salmos 91:1-2", "1 Pedro 5:7" → { cita, texto } or null. Max 3 verses. */
function buscaVersiculo(cita, biblia) {
  const m = String(cita || '').trim().match(/^((?:[123]\s*)?[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+de\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?)\s+(\d{1,3})\s*[:.,]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
  if (!m) return null;
  let libroBuscado = sinTildes(m[1]).replace(/^([123])\s*/, '$1 ');
  if (libroBuscado === 'salmo') libroBuscado = 'salmos';
  if (libroBuscado === 'cantar de los cantares') libroBuscado = 'cantares';
  const libro = Object.keys(biblia).find(l => sinTildes(l) === libroBuscado);
  if (!libro) return null;
  const capitulo = biblia[libro][m[2]];
  const desde = Number(m[3]);
  const hasta = m[4] ? Number(m[4]) : desde;
  if (!capitulo || hasta < desde || hasta - desde > 2) return null;
  const partes = [];
  for (let v = desde; v <= hasta; v += 1) {
    if (!capitulo[String(v)]) return null;
    partes.push(capitulo[String(v)]);
  }
  // A verse that ends mid-sentence (",", ";", ":") is closed with "…".
  const texto = partes.join(' ').trim().replace(/[,;:]$/, '…');
  return { cita: `${libro} ${m[2]}:${desde}${hasta > desde ? `-${hasta}` : ''}`, texto };
}

// Topics that only make sense on a specific day (07/10/2026: one came out on a Wednesday).
const SOLO_LUNES = 'para empezar la semana';

function temaDelDia(fecha = new Date(), usados = []) {
  const lunes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(fecha) === 'Mon';
  if (lunes && !usados.includes(SOLO_LUNES)) return SOLO_LUNES;
  const libres = TEMAS.filter(t => t !== SOLO_LUNES && !usados.includes(t));
  const lista = libres.length ? libres : TEMAS.filter(t => t !== SOLO_LUNES);
  const dia = Math.floor(fecha.getTime() / 86400000);
  return lista[dia % lista.length];
}

function promptContenido(tema) {
  return `Eres el redactor de "${MARCA}", una cuenta cristiana en español para Latinoamérica (adultos de 35-60 años).
Escribe un carrusel de Instagram con oraciones ${tema}.

Devuelve SOLO un JSON válido, sin texto antes ni después, con esta forma:
{
  "portada": "frase gancho de 6-12 palabras que nombre el momento o lo que siente la persona, con cariño (ej.: Para cuando el corazón no encuentra paz al llegar la noche / Oraciones para entregarle a Dios el cansancio de hoy)",
  "destacado": "2-4 palabras EXACTAS de la portada que irán en cursiva",
  "subtitulo": "frase corta que invita a deslizar (ej.: Ora conmigo estas palabras:)",
  "oraciones": [
    { "texto": "oración en primera persona, 45-65 palabras, dirigida a Dios (Señor, Padre...), cálida y concreta, que termina en Amén.", "cita": "Libro capítulo:versículo" }
  ],
  "pie": "1-2 frases para el texto de la publicación, sin hashtags"
}

Reglas:
- Exactamente 4 oraciones, distintas entre sí (gratitud, entrega, petición, confianza).
- "cita": un versículo REAL y conocido que encaje con esa oración, formato "Salmos 4:8" o "Filipenses 4:6-7" (máximo 3 versículos). No escribas el texto del versículo.
- Español neutro, frases cortas, sin la palabra "yo" al principio, sin emojis, sin comillas dentro del texto.
- No prometas milagros ni curaciones; habla de confianza, paz y compañía de Dios.
${REGLA_FE}
- Nunca insinúes que la persona no sabe orar ni qué decirle a Dios: nada de "no sabes orar", "no sabes qué decirle a Dios", "cómo orar" o "aprende a orar". Quien lee ya ora; la portada le acompaña.`;
}

function extraeJson(texto) {
  const limpio = String(texto || '').replace(/```(?:json)?/gi, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin <= inicio) throw new Error('The AI returned no JSON');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

// The owner (04/10/2026): doesn't like the cover saying people "no saben orar".
const TONO_PROHIBIDO = /no\s+sabes?\s+(c[oó]mo\s+)?orar|no\s+sabes?\s+qu[eé]\s+decir|c[oó]mo\s+orar|aprende\s+a\s+orar|no\s+sabes?\s+c[oó]mo\s+(hablar|dirigirte)/i;

/** Cleans what the AI returns and attaches the verified verse. At least 3 valid prayers. */
function validaContenido(crudo, biblia, tema) {
  const portada = String(crudo?.portada || '').trim();
  if (portada.length < 10 || portada.length > 110) throw new Error('Cover empty or too long');
  const subtituloCrudo = String(crudo?.subtitulo || '');
  if (TONO_PROHIBIDO.test(portada) || TONO_PROHIBIDO.test(subtituloCrudo)) {
    throw new Error('The cover implies the person does not know how to pray');
  }
  const oraciones = [];
  for (const o of Array.isArray(crudo?.oraciones) ? crudo.oraciones : []) {
    const crudoTexto = String(o?.texto || '').replace(/\s+/g, ' ').trim();
    const palabras = crudoTexto.split(' ').length;
    const versiculo = buscaVersiculo(o?.cita, biblia);
    if (!versiculo || palabras < 25 || palabras > 85) continue;
    oraciones.push({ texto: conAmen(crudoTexto), versiculo }); // faith rule: Jesus as King + Amén
  }
  if (oraciones.length < 3) throw new Error(`Only ${oraciones.length} prayers with a verifiable verse`);
  const destacado = String(crudo?.destacado || '').trim();
  return {
    tema,
    portada,
    destacado: destacado && portada.includes(destacado) ? destacado : '',
    subtitulo: String(crudo?.subtitulo || 'Ora conmigo estas palabras:').trim().slice(0, 60),
    oraciones: oraciones.slice(0, 4),
    pie: String(crudo?.pie || '').trim().slice(0, 300)
  };
}

async function generaContenido({ ai, tema, biblia = cargaBiblia(), intentos = 3 }) {
  let ultimo;
  for (let i = 0; i < intentos; i += 1) {
    try {
      const respuesta = await ai.generateText(promptContenido(tema), { maxTokens: 2500, temperature: 0.8 });
      return validaContenido(extraeJson(respuesta), biblia, tema);
    } catch (error) {
      ultimo = error;
    }
  }
  throw new Error(`Could not write the carousel: ${ultimo?.message}`);
}

const HASHTAGS = {
  'antes de dormir': '#oraciondelanoche', 'al despertar': '#oraciondelamanana', 'cuando tienes ansiedad': '#ansiedad',
  'por tu familia': '#familia', 'por tus hijos': '#hijos', 'para pedir protección': '#proteccion', 'por tu salud': '#sanidad'
};

/** Post text: hook, an invitation to save/send and 5 hashtags (Instagram's cap). */
function textoCarrusel(datos) {
  const tags = ['#oracion', '#fe', '#versiculosbiblicos', HASHTAGS[datos.tema] || '#oraciondiaria', '#Dios'];
  return [
    datos.portada,
    datos.pie,
    '📌 Guarda estas oraciones para volver a ellas cuando las necesites.\n📩 Envíalas a alguien que necesite leerlas hoy.\n🙏 Escribe «Amén» y el nombre de alguien por quien quieres orar: hoy oramos por ti.',
    'Versículos: Reina-Valera 1909.',
    lineaLibro(),
    [...new Set(tags)].slice(0, 5).join(' ')
  ].filter(Boolean).join('\n\n');
}

// ---------- Design ----------

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function estilos(alto = ALTO) {
  const f = n => `file://${path.join(FUENTES, n)}`;
  return `
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('${f('Jost-VF.ttf')}'); font-weight: 100 900; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${ANCHO}px; height: ${alto}px; }
  body { position: relative; overflow: hidden; color: #2b2520; font-family: 'Cormorant', serif;
    background: radial-gradient(ellipse at 30% 20%, #f6efe6 0%, #ece2d4 55%, #e2d5c4 100%); }
  .grano { position: absolute; inset: 0; opacity: .35; mix-blend-mode: multiply; }
  .sombra { position: absolute; right: -120px; top: -60px; width: 760px; height: 980px; opacity: .10; filter: blur(14px); }
  .cab { position: absolute; top: 64px; left: 84px; right: 84px; display: flex; justify-content: space-between;
    font-family: 'Jost'; font-size: 22px; letter-spacing: .22em; text-transform: uppercase; color: #6d6156; }
  .pie { position: absolute; bottom: 64px; left: 84px; right: 84px; display: flex; justify-content: space-between; align-items: center;
    font-family: 'Jost'; font-size: 22px; letter-spacing: .22em; text-transform: uppercase; color: #6d6156; }
  .centro { position: absolute; top: 150px; bottom: 150px; left: 104px; right: 104px;
    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  .portada h1 { font-size: 100px; line-height: 1.04; font-weight: 600; letter-spacing: -.01em; }
  .portada h1 em { font-weight: 500; }
  .portada p { margin-top: 44px; font-size: 46px; font-weight: 600; }
  .oracion { font-size: 56px; line-height: 1.24; font-weight: 500; }
  .raya { width: 90px; height: 2px; background: #a8957f; margin: 46px auto 34px; }
  .verso { font-style: italic; font-size: 34px; line-height: 1.3; color: #4d433a; }
  .ref { margin-top: 18px; font-family: 'Jost'; font-size: 22px; letter-spacing: .24em; text-transform: uppercase; color: #7b6d60; }
  .cierre h2 { font-size: 64px; font-weight: 600; line-height: 1.1; margin-bottom: 70px; }
  .iconos { display: grid; grid-template-columns: 1fr 1fr; gap: 64px 90px; }
  .icono { display: flex; flex-direction: column; align-items: center; gap: 20px; }
  .icono svg { width: 120px; height: 120px; }
  .icono span { font-family: 'Jost'; font-size: 22px; letter-spacing: .2em; text-transform: uppercase; color: #5d5147; max-width: 300px; line-height: 1.4; }
  `;
}

const grano = (alto = ALTO) => `<svg class="grano" xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${alto}"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .38  0 0 0 0 .3  0 0 0 .55 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>`;
// A branch's shadow on the wall, like on the reference accounts.
const SOMBRA = `<svg class="sombra" viewBox="0 0 760 980" xmlns="http://www.w3.org/2000/svg" fill="#3b3128">
  <path d="M520 980 C 470 720 430 520 360 300" stroke="#3b3128" stroke-width="10" fill="none"/>
  <ellipse cx="300" cy="250" rx="70" ry="190" transform="rotate(-28 300 250)"/>
  <ellipse cx="470" cy="420" rx="60" ry="170" transform="rotate(32 470 420)"/>
  <ellipse cx="350" cy="560" rx="58" ry="160" transform="rotate(-40 350 560)"/>
  <ellipse cx="520" cy="700" rx="52" ry="150" transform="rotate(38 520 700)"/>
  <ellipse cx="420" cy="140" rx="55" ry="140" transform="rotate(20 420 140)"/>
</svg>`;

const ICONOS = {
  enviar: '<path d="M20 60 L104 22 L78 104 L60 70 Z M60 70 L104 22" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linejoin="round"/>',
  guardar: '<path d="M34 18 H86 V104 L60 82 L34 104 Z" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linejoin="round"/>',
  amor: '<path d="M60 100 C 20 72 14 50 22 36 C 32 18 54 20 60 38 C 66 20 88 18 98 36 C 106 50 100 72 60 100 Z" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linejoin="round"/>',
  comentar: '<path d="M60 22 C 92 22 106 40 106 58 C 106 78 88 94 60 94 C 52 94 44 92 38 90 L18 100 L26 82 C 18 75 14 67 14 58 C 14 40 30 22 60 22 Z" fill="none" stroke="#6b4a2b" stroke-width="7" stroke-linejoin="round"/>'
};

function pagina(cuerpo, { pie = 'Guarda y comparte', indice = '', alto = ALTO } = {}) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${estilos(alto)}</style></head><body>
  ${grano(alto)}${SOMBRA}
  <div class="cab"><span>${esc(MARCA)}</span><span style="text-transform:none;letter-spacing:.06em">${esc(USUARIO)}</span></div>
  ${cuerpo}
  <div class="pie"><span>${esc(pie)}</span><span>${esc(indice)}</span></div>
  <script>
    // If the text doesn't fit, the font shrinks until it does.
    document.fonts.ready.then(() => {
      const c = document.querySelector('.centro');
      let guard = 40;
      while (c.scrollHeight > c.clientHeight && guard-- > 0) {
        for (const el of c.querySelectorAll('h1,.oracion,.verso,p,h2')) {
          el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 0.96) + 'px';
        }
      }
      document.body.dataset.listo = '1';
    });
  </script></body></html>`;
}

/**
 * HTML for each slide. `video: true` = Reel version (9:16, without "Desliza" or numbering, which
 * make no sense in a video).
 */
function diapositivas(datos, { video = false } = {}) {
  const alto = video ? ALTO_VIDEO : ALTO;
  const destacado = datos.destacado
    ? esc(datos.portada).replace(esc(datos.destacado), `<em>${esc(datos.destacado)}</em>`)
    : esc(datos.portada);
  const total = datos.oraciones.length + 2;
  const num = i => (video ? '' : `${i}/${total}`);
  const html = [pagina(`<div class="centro portada"><h1>${destacado}</h1><p>${esc(datos.subtitulo)}</p></div>`,
    { pie: video ? 'Ora conmigo' : 'Desliza', indice: video ? '' : '→', alto })];
  datos.oraciones.forEach((o, i) => {
    html.push(pagina(`<div class="centro"><div class="oracion">${esc(o.texto)}</div><div class="raya"></div>
      <div class="verso">“${esc(o.versiculo.texto)}”</div><div class="ref">${esc(o.versiculo.cita)} · RV1909</div></div>`,
    { indice: num(i + 2), alto }));
  });
  html.push(pagina(`<div class="centro cierre"><h2>Si estas oraciones te hablaron,<br><em>no te las quedes</em></h2>
    <div class="iconos">
      <div class="icono"><svg viewBox="0 0 120 120">${ICONOS.enviar}</svg><span>Envíala a alguien que la necesite</span></div>
      <div class="icono"><svg viewBox="0 0 120 120">${ICONOS.guardar}</svg><span>Guárdala para más tarde</span></div>
      <div class="icono"><svg viewBox="0 0 120 120">${ICONOS.amor}</svg><span>Dale amor</span></div>
      <div class="icono"><svg viewBox="0 0 120 120">${ICONOS.comentar}</svg><span>Comenta un Amén</span></div>
    </div></div>`, { pie: 'Síguenos para más oraciones', indice: num(total), alto }));
  return html;
}

/** Draws each slide with Chromium and returns the JPG paths. */
async function renderiza(datos, dir, { chromium = require('playwright').chromium, video = false } = {}) {
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'carrusel-'));
  const browser = await chromium.launch();
  const rutas = [];
  try {
    const page = await browser.newPage({ viewport: { width: ANCHO, height: video ? ALTO_VIDEO : ALTO }, deviceScaleFactor: 1 });
    const htmls = diapositivas(datos, { video });
    for (let i = 0; i < htmls.length; i += 1) {
      const archivo = path.join(tmp, `d${i + 1}.html`);
      await fs.promises.writeFile(archivo, htmls[i]);
      await page.goto(`file://${archivo}`);
      await page.waitForFunction(() => document.body.dataset.listo === '1', null, { timeout: 15000 });
      const salida = path.join(dir, `diapositiva-${String(i + 1).padStart(2, '0')}.jpg`);
      await page.screenshot({ path: salida, type: 'jpeg', quality: 92 });
      rutas.push(salida);
    }
  } finally {
    await browser.close();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
  return rutas;
}

module.exports = {
  TEMAS, cargaBiblia, buscaVersiculo, temaDelDia, promptContenido, extraeJson,
  validaContenido, generaContenido, textoCarrusel, diapositivas, renderiza, pagina, esc, ANCHO, ALTO
};
