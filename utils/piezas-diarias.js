/**
 * Two daily images for Instagram and Facebook (requested by the owner, 05/10/2026).
 * Research: notas/estrategia and the competitor notes of 05/10/2026.
 *
 * 1. "fecha" — Morning prayer WITH THE DATE in the image ("Lunes 5 de
 *    Octubre"). On 4 of 6 big accounts the dated post is the most shared (×3-7): it's forwarded as
 *    "today's good morning".
 * 2. "frase" — A short quote to share (@365fanpage / @mundoescritos style): a clean white
 *   background, a sentence about Jesus of Nazareth, King of kings, and "Inspirada en <cita>" with
 *   the REAL RV1909 verse below. The niche's viral posts make up the verse text; never here.
 *
 * Faith rule (utils/reglas-oracion.js): Jesus of Nazareth as King and «Amén».
 * Settings per piece (<clave> = oracion_fecha | frase_compartir):
 *   <clave>_enabled ('false' turns it off), <clave>_time (channel time), <clave>_last.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { localDateKey, parseClock, zonedToUtc, DEFAULT_TZ } = require('./daily-slot');
const carrusel = require('./carrusel-oracion');
const { REGLA_FE, conAmen, nombraAJesusRey, CIERRE_JESUS } = require('./reglas-oracion');
const { lineaLibro } = require('./libro');

const MAX_INTENTOS_DIA = 3;
const TONO_PROHIBIDO = /no\s+sabes?\s+(c[oó]mo\s+)?orar|no\s+sabes?\s+qu[eé]\s+decir|c[oó]mo\s+orar|aprende\s+a\s+orar|milagro\s+(garantizado|seguro)|te\s+sanar[aá]\s+hoy/i;
const TEMAS_FECHA = ['entregar el día a Dios', 'protección para la familia', 'paz en el corazón', 'fuerza para el trabajo',
  'confianza en el tiempo de Dios', 'gratitud por un nuevo día', 'sabiduría para decidir'];
const TEMAS_FRASE = ['Jesús va delante de ti', 'Jesús reina sobre tus preocupaciones', 'el Rey no te ha soltado',
  'tu batalla está en manos del Rey', 'descansa: Jesús tiene el control', 'Jesús es fiel en la espera', 'el Rey de reyes te llama por tu nombre'];

const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

/** "Lunes 5 de Octubre" in the channel's time zone (as the niche's accounts write it). */
function fechaLarga(now, tz = DEFAULT_TZ) {
  const partes = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).formatToParts(now);
  const v = tipo => partes.find(p => p.type === tipo)?.value || '';
  return `${capital(v('weekday'))} ${v('day')} de ${capital(v('month'))}`;
}

const temaDe = (lista, now) => lista[Math.floor(now.getTime() / 86400000) % lista.length];

// ---------- 1. Dated morning prayer ----------

function promptFecha(tema, fecha) {
  return `Escribe la oración de la mañana del ${fecha} para "Oraciones en Presencia de Yeshua", cuenta cristiana en español (adultos 35-60). Tema: ${tema}.
Devuelve SOLO un JSON válido:
{ "gancho": "primera frase de la oración, 8-16 palabras, empieza con 'Amado Dios,' o 'Señor Jesús,' o 'Padre amado,'", "texto": "el resto de la oración, 30-50 palabras, primera persona, cálida y concreta (familia, paz, protección, trabajo)", "pie": "1 frase cálida para el texto de la publicación" }
Reglas: español neutro, sin emojis, sin comillas dentro del texto, no prometas milagros, dinero ni curaciones.
${REGLA_FE}
(El «Amén» final lo pone el diseño: no lo escribas.)`;
}

function validaFecha(crudo) {
  const gancho = String(crudo?.gancho || '').replace(/\s+/g, ' ').trim();
  const resto = String(crudo?.texto || '').replace(/\s+/g, ' ').trim();
  const nGancho = gancho.split(' ').filter(Boolean).length;
  const nResto = resto.split(' ').filter(Boolean).length;
  if (nGancho < 5 || nGancho > 22) throw new Error(`Gancho de ${nGancho} palabras`);
  if (nResto < 20 || nResto > 70) throw new Error(`Prayer of ${nResto} words`);
  const pie = String(crudo?.pie || '').trim().slice(0, 200);
  if ([gancho, resto, pie].some(t => TONO_PROHIBIDO.test(t))) throw new Error('Tone not allowed');
  // Faith rule on the whole prayer; the hook goes in bold, the rest normal.
  const completa = conAmen(`${gancho} ${resto}`).replace(/\s*Amén\.$/, '');
  return { gancho, texto: completa.slice(gancho.length).trim(), pie };
}

function htmlFecha(d) {
  const cuerpo = `<style>
    .fecha { font-style: italic; font-size: 44px; color: #6d6156; margin-bottom: 18px; }
    .titulo { font-family: 'Cormorant'; font-style: italic; font-weight: 700; font-size: 92px; line-height: 1; margin-bottom: 44px; }
    .oracion strong { font-weight: 700; }
    .amen { align-self: flex-end; margin-top: 30px; font-style: italic; font-weight: 700; font-size: 70px; }
  </style>
  <div class="centro">
    <p class="fecha">${carrusel.esc(d.fecha)}</p>
    <h2 class="titulo">Oración de la mañana</h2>
    <div class="oracion"><strong>${carrusel.esc(d.gancho)}</strong> ${carrusel.esc(d.texto)}</div>
    <h2 class="amen">Amén.</h2>
  </div>`;
  return carrusel.pagina(cuerpo, { pie: 'Envíala a tu familia' });
}

function textoFecha(d) {
  return [
    `Feliz y bendecido ${d.fecha.toLowerCase()} 🙏`,
    `${d.gancho} ${d.texto} Amén.`,
    d.pie,
    '🙏 Escribe «Amén» si recibes esta oración para tu día.\n📩 Envíala a tu familia como el buenos días de hoy.',
    lineaLibro(),
    '#oraciondelamanana #oraciondehoy #buenosdias #JesusEsRey #Dios'
  ].filter(Boolean).join('\n\n');
}

// ---------- 2. Quote to share ----------

function promptFrase(tema) {
  return `Escribe una frase cristiana corta para compartir en Instagram, de "Oraciones en Presencia de Yeshua". Idea: ${tema}.
Devuelve SOLO un JSON válido:
{ "frase": "15-32 palabras, en segunda persona (te habla a ti), sobre Jesús de Nazaret como Rey de reyes que cuida, guía y reina sobre la vida de quien lee", "cita": "un versículo REAL que inspire la frase, formato 'Salmos 23:1' o 'Isaías 41:10' (máximo 2 versículos seguidos, UNA sola cita, nunca dos separadas por ;), sin el texto", "pie": "1-2 frases para el texto de la publicación" }
Reglas: español neutro, sin emojis, sin comillas dentro, no pongas palabras inventadas en boca de Dios ni de Jesús (no uses "Jesús dijo" ni "Dios te dice"), no prometas milagros, dinero ni curaciones. La gloria es para Dios Padre y para Jesús, el Rey.`;
}

function validaFrase(crudo, biblia) {
  let frase = String(crudo?.frase || '').replace(/\s+/g, ' ').trim().replace(/^["“«]|["”»]$/g, '');
  const n = frase.split(' ').filter(Boolean).length;
  if (n < 10 || n > 40) throw new Error(`Frase de ${n} palabras`);
  if (/(jes[uú]s|dios)\s+(te\s+)?(dijo|dice)/i.test(frase)) throw new Error('Puts words in God\'s mouth');
  if (TONO_PROHIBIDO.test(frase)) throw new Error('Tone not allowed');
  if (!nombraAJesusRey(frase)) frase = `${frase.replace(/[.\s]+$/, '')}. Jesús de Nazaret es el Rey de reyes.`;
  // The AI sometimes joins two references ("Juan 10:3; Apocalipsis 19:16"): the first one that exists counts (07/10/2026).
  const versiculo = String(crudo?.cita || '').split(/\s*;\s*/).filter(Boolean)
    .map(c => carrusel.buscaVersiculo(c, biblia)).find(v => v && v.texto.split(' ').length <= 60);
  if (!versiculo) throw new Error(`Unverifiable reference: ${crudo?.cita}`);
  return { frase: /[.!?]$/.test(frase) ? frase : `${frase}.`, versiculo, pie: String(crudo?.pie || '').trim().slice(0, 250) };
}

function htmlFrase(d) {
  const esc = carrusel.esc;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Cormorant'; src: url('file://${path.join(__dirname, '..', 'assets', 'fonts', 'CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('file://${path.join(__dirname, '..', 'assets', 'fonts', 'CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('file://${path.join(__dirname, '..', 'assets', 'fonts', 'Jost-VF.ttf')}'); font-weight: 100 900; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${carrusel.ANCHO}px; height: ${carrusel.ALTO}px; }
  body { background: linear-gradient(160deg, #ffffff 0%, #fbfaf8 60%, #f1eee9 100%); color: #1f1b17; font-family: 'Cormorant', serif; }
  .centro { position: absolute; top: 170px; bottom: 170px; left: 120px; right: 120px; display: flex; flex-direction: column;
    justify-content: center; align-items: center; text-align: center; }
  .frase { font-size: 68px; line-height: 1.22; font-weight: 500; }
  .raya { width: 70px; height: 2px; background: #c9b79c; margin: 52px auto 34px; }
  .verso { font-style: italic; font-size: 34px; line-height: 1.32; color: #5a5048; }
  .ref { margin-top: 18px; font-family: 'Jost'; font-size: 21px; letter-spacing: .22em; text-transform: uppercase; color: #8a7d70; }
  .firma { position: absolute; bottom: 80px; width: 100%; text-align: center; font-style: italic; font-size: 30px; color: #8a7d70; }
  </style></head><body>
  <div class="centro"><div class="frase">${esc(d.frase)}</div><div class="raya"></div>
    <div class="verso">“${esc(d.versiculo.texto)}”</div><div class="ref">Inspirada en ${esc(d.versiculo.cita)} · RV1909</div></div>
  <div class="firma">@your_account</div>
  <script>document.fonts.ready.then(() => { const c = document.querySelector('.centro'); let g = 40;
    while (c.scrollHeight > c.clientHeight && g-- > 0) for (const el of c.querySelectorAll('.frase,.verso')) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * 0.96) + 'px';
    document.body.dataset.listo = '1'; });</script></body></html>`;
}

function textoFrase(d) {
  return [
    d.frase,
    d.pie,
    '📩 Compártela con alguien que necesite leerla hoy.\n📌 Guárdala para cuando la necesites.',
    `Inspirada en ${d.versiculo.cita} (Reina-Valera 1909).`,
    lineaLibro(),
    '#JesusEsRey #fe #versiculosbiblicos #Dios #frasescristianas'
  ].filter(Boolean).join('\n\n');
}

// ---------- Shared ----------

const PIEZAS = {
  fecha: { clave: 'oracion_fecha', hora: '07:00', nombre: 'Oración de la mañana con fecha' },
  frase: { clave: 'frase_compartir', hora: '20:00', nombre: 'Frase para compartir' }
};

async function escribe({ ai, prompt, valida, intentos = 3 }) {
  let ultimo;
  for (let i = 0; i < intentos; i += 1) {
    try {
      return valida(carrusel.extraeJson(await ai.generateText(prompt, { maxTokens: 900, temperature: 0.8 })));
    } catch (error) { ultimo = error; }
  }
  throw new Error(`Could not write: ${ultimo?.message}`);
}

/** Content + HTML + post text for a piece. */
async function preparaPieza(tipo, { ai, now = new Date(), tz = DEFAULT_TZ, biblia }) {
  if (tipo === 'fecha') {
    const fecha = fechaLarga(now, tz);
    const tema = temaDe(TEMAS_FECHA, now);
    const d = { fecha, tema, ...await escribe({ ai, prompt: promptFecha(tema, fecha), valida: validaFecha }) };
    return { datos: d, html: htmlFecha(d), texto: textoFecha(d) };
  }
  const tema = temaDe(TEMAS_FRASE, now);
  const libro = biblia || carrusel.cargaBiblia();
  const d = { tema, ...await escribe({ ai, prompt: promptFrase(tema), valida: crudo => validaFrase(crudo, libro) }) };
  return { datos: d, html: htmlFrase(d), texto: textoFrase(d) };
}

async function renderizaJpg(html, salida, { chromium = require('playwright').chromium } = {}) {
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pieza-'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: carrusel.ANCHO, height: carrusel.ALTO }, deviceScaleFactor: 1 });
    const archivo = path.join(tmp, 'pieza.html');
    await fs.promises.writeFile(archivo, html);
    await page.goto(`file://${archivo}`);
    await page.waitForFunction(() => document.body.dataset.listo === '1', null, { timeout: 15000 });
    await page.screenshot({ path: salida, type: 'jpeg', quality: 92 });
    return salida;
  } finally {
    await browser.close();
    await fs.promises.rm(tmp, { recursive: true, force: true });
  }
}

async function tocaHoy(tipo, { db, now = new Date() }) {
  const { clave, hora } = PIEZAS[tipo];
  if (await db.getSetting(`${clave}_enabled`) === 'false') return null;
  const tz = await db.getSetting('channel_timezone') || DEFAULT_TZ;
  const hoy = localDateKey(now, tz);
  const ultimo = JSON.parse(await db.getSetting(`${clave}_last`) || '{}');
  if (ultimo.fecha === hoy && (ultimo.status === 'published' || (ultimo.intentos || 0) >= MAX_INTENTOS_DIA)) return null;
  const reloj = parseClock(await db.getSetting(`${clave}_time`) || hora) || parseClock(hora);
  const [year, month, day] = hoy.split('-').map(Number);
  return now.getTime() >= zonedToUtc({ year, month, day, ...reloj }, tz) ? { hoy, tz } : null;
}

/** Makes and publishes a piece (image in the Instagram feed + photo on the Facebook Page). */
async function publicaPieza(tipo, {
  db, ai, logger, env = process.env, now = new Date(), dataDir = path.join(process.cwd(), 'data'), deps = {}
}) {
  const turno = await tocaHoy(tipo, { db, now });
  if (!turno) return null;
  const { clave, nombre } = PIEZAS[tipo];
  const ig = require('./instagram-reels');
  const fbMod = require('./facebook-reels');
  const enlaceMod = require('./enlace-publico');
  const d = {
    preparaPieza, renderizaJpg, enlace: enlaceMod.enlacePublicoConfig(env), publicaCopia: enlaceMod.publicaCopia,
    borraCopia: enlaceMod.borraCopia, preparaImagenIG: ig.preparaImagenIG, estadoIG: ig.estadoIG, publicaIG: ig.publicaIG,
    publicaFoto: fbMod.publicaFoto, espera: ms => new Promise(ok => setTimeout(ok, ms)), ...deps
  };
  if (!d.enlace) return null; // both networks download the image from a public link
  const token = await (deps.tokenInstagram || ig.tokenInstagram)(db, env);
  const fb = fbMod.facebookConfig(env);

  const anterior = JSON.parse(await db.getSetting(`${clave}_last`) || '{}');
  const mismoDia = anterior.fecha === turno.hoy;
  const intentos = (mismoDia ? anterior.intentos || 0 : 0) + 1;
  const redes = mismoDia ? { ...(anterior.redes || {}) } : {};
  const tareas = [token && 'instagram', fb && 'facebook'].filter(t => t && redes[t]?.status !== 'published');
  if (!tareas.length) return null;

  const tmp = await fs.promises.mkdtemp(path.join(dataDir, `tmp-${clave}-`));
  let copia = null;
  try {
    const pieza = await d.preparaPieza(tipo, { ai, now, tz: turno.tz });
    const jpg = await d.renderizaJpg(pieza.html, path.join(tmp, `${clave}.jpg`));
    copia = await d.publicaCopia(jpg, d.enlace);
    for (const red of tareas) {
      try {
        if (red === 'instagram') {
          const { containerId, igUserId } = await d.preparaImagenIG({ token, imageUrl: copia.url, caption: pieza.texto });
          let estado = 'IN_PROGRESS';
          for (let i = 0; i < 20 && estado === 'IN_PROGRESS'; i += 1) {
            ({ status: estado } = await d.estadoIG({ token, containerId }));
            if (estado === 'IN_PROGRESS') await d.espera(5000);
          }
          if (estado !== 'FINISHED') throw new Error(`Instagram: contenedor ${estado}`);
          const r = await d.publicaIG({ token, igUserId, containerId });
          redes.instagram = { status: 'published', mediaId: r.mediaId, url: r.permalink };
        } else {
          const r = await d.publicaFoto({ config: fb, imageUrl: copia.url, message: pieza.texto });
          redes.facebook = { status: 'published', postId: r.postId, url: `https://www.facebook.com/${r.postId}` };
        }
        logger?.success?.(`${nombre} → ${red}: ${redes[red].url || 'ok'}`);
      } catch (error) {
        redes[red] = { status: 'failed', error: error.message };
        logger?.warn?.(`${nombre} → ${red} failed (attempt ${intentos}): ${error.message}`);
      }
    }
  } catch (error) {
    for (const t of tareas) if (redes[t]?.status !== 'published') redes[t] = { status: 'failed', error: error.message };
    logger?.warn?.(`${nombre} failed (attempt ${intentos}): ${error.message}`);
  } finally {
    if (copia) await d.borraCopia(copia.nombre, d.enlace);
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
  const todas = tareas.every(t => redes[t]?.status === 'published');
  const registro = { fecha: turno.hoy, status: todas ? 'published' : 'failed', redes, intentos, at: now.toISOString() };
  await db.setSetting(`${clave}_last`, JSON.stringify(registro));
  return registro;
}

module.exports = {
  PIEZAS, CIERRE_JESUS, fechaLarga, promptFecha, validaFecha, htmlFecha, textoFecha,
  promptFrase, validaFrase, htmlFrase, textoFrase, preparaPieza, renderizaJpg, tocaHoy, publicaPieza
};
