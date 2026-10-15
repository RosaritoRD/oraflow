#!/usr/bin/env node
/**
 * Ebook devocional de 30 días (05/10/2026, primer producto: ansiedad y paz).
 *
 *   node scripts/ebook.js [salida]       (dentro del contenedor: /app/temp/ebook)
 *
 * La IA escribe cada día (título, reflexión, oración y un paso práctico) y
 * ELIGE el versículo; el texto del versículo sale de la RV1909 y una cita que
 * no existe se descarta y se vuelve a pedir. Regla de fe del canal: cada
 * oración exalta a Jesús de Nazaret como Rey de reyes y termina en «Amén».
 * Salen: ebook.pdf (6×9 in), portada.jpg (1600×2400, para la tienda),
 * contenido.json (para revisar o regenerar) y tienda.txt (texto de venta).
 */
const fs = require('fs');
const path = require('path');
const { AITextService } = require('../utils/ai-text-service');
const { cargaBiblia, buscaVersiculo, extraeJson } = require('../utils/carrusel-oracion');
const { REGLA_FE, conAmen } = require('../utils/reglas-oracion');

const LIBRO = {
  titulo: '30 días de paz',
  subtitulo: 'Devocional para cuando la ansiedad no te deja descansar',
  autor: 'Oraciones en Presencia de Yeshua',
  // Hotmart exige el nombre del autor dentro del archivo (05/10/2026).
  autorPersona: process.env.EBOOK_AUTOR || 'el autor',
  usuario: '@tu_cuenta',
  publico: 'hispanos cristianos en Estados Unidos y Latinoamérica, 30-60 años, con ansiedad por el trabajo, la familia, el dinero o la salud',
  semanas: [
    { tema: 'Cuando la mente no se calla', dias: 'pensamientos que no paran, preocuparse por todo, insomnio, el miedo a lo que puede pasar, respirar en Dios, entregar el control, el descanso de la noche' },
    { tema: 'Las cargas de cada día', dias: 'deudas y dinero, el trabajo y el jefe, los hijos, la salud propia y de los padres, vivir lejos de la familia, el cansancio, sentirse solo' },
    { tema: 'Lo que Dios dice de ti', dias: 'no estás solo, eres hijo amado, Dios cuida de lo pequeño, sus promesas no fallan, Él pelea por ti, su paz no es como la del mundo, Jesús el Rey reina sobre tu ansiedad' },
    { tema: 'Una vida nueva en paz', dias: 'gratitud cada mañana, perdonar y soltar, pedir ayuda sin vergüenza, rutinas de oración, cuidar el cuerpo, servir a otros, esperar con fe' },
    { tema: 'Para siempre en sus manos', dias: 'cuando la ansiedad vuelve, la paz que permanece' }
  ]
};

function prompt(semana, desde, cuantos, hechos) {
  return `Eres el autor de un devocional cristiano en español, "${LIBRO.titulo}: ${LIBRO.subtitulo}", para ${LIBRO.publico}.
Escribe los días ${desde} a ${desde + cuantos - 1} (de 30). Semana: "${semana.tema}". Ideas para estos días: ${semana.dias}.
Ya escritos (no repitas tema ni versículo): ${hechos.map(d => `${d.titulo} (${d.versiculo.cita})`).join('; ') || 'ninguno'}.

Devuelve SOLO un JSON válido: { "dias": [ {
  "titulo": "3-7 palabras, cálido y concreto",
  "cita": "un versículo REAL que encaje, formato 'Filipenses 4:6-7' o 'Salmos 4:8' (máximo 3 versículos), sin el texto",
  "reflexion": "170-230 palabras en segunda persona: una escena cotidiana real (la cuenta que llega, la noche sin dormir, el mensaje del jefe), lo que dice el versículo y cómo cambia esa escena. Sin sermón, sin tecnicismos.",
  "oracion": "60-90 palabras en primera persona, dirigida a Dios Padre, que termina en Amén",
  "paso": "1 acción práctica y pequeña para hoy, 15-35 palabras (respirar, escribir, llamar a alguien, apagar el teléfono…)"
} ] }
Reglas:
- Exactamente ${cuantos} días, distintos entre sí. Español neutro, frases cortas, sin emojis, sin comillas dentro de los textos.
- No prometas curaciones ni milagros de dinero. La fe acompaña; no sustituye a un médico ni a un terapeuta.
${REGLA_FE}`;
}

function valida(crudo, biblia) {
  const dias = [];
  for (const d of crudo?.dias || []) {
    const versiculo = buscaVersiculo(d.cita, biblia);
    const reflexion = String(d.reflexion || '').replace(/\s+/g, ' ').trim();
    const oracion = String(d.oracion || '').replace(/\s+/g, ' ').trim();
    const n = reflexion.split(' ').length;
    if (!versiculo || n < 120 || n > 300 || oracion.split(' ').length < 35 || !d.titulo || !d.paso) continue;
    dias.push({ titulo: String(d.titulo).trim(), versiculo, reflexion, oracion: conAmen(oracion), paso: String(d.paso).trim() });
  }
  return dias;
}

async function escribeDias(ai, biblia, { dias = [], guarda = () => {} } = {}) {
  let intentos = 0;
  for (const semana of LIBRO.semanas) {
    const objetivo = semana === LIBRO.semanas.at(-1) ? 30 : dias.length + 7;
    while (dias.length < objetivo && intentos < 25) {
      intentos += 1;
      const cuantos = Math.min(4, objetivo - dias.length);
      try {
        const nuevos = valida(extraeJson(await ai.generateText(prompt(semana, dias.length + 1, cuantos, dias), { maxTokens: 6000, temperature: 0.8 })), biblia)
          .filter(d => !dias.some(x => x.versiculo.cita === d.versiculo.cita))
          .slice(0, cuantos);
        for (const d of nuevos) dias.push({ ...d, semana: semana.tema });
        guarda(dias);
        console.log(`  días escritos: ${dias.length}/30`);
      } catch (error) {
        console.log(`  reintento (${error.message})`);
      }
    }
  }
  if (dias.length < 30) throw new Error(`Solo ${dias.length} días válidos`);
  return dias;
}

const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FUENTES = path.join(__dirname, '..', 'assets', 'fonts');

function estilos() {
  const f = n => `file://${path.join(FUENTES, n)}`;
  return `@font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('${f('Jost-VF.ttf')}'); font-weight: 100 900; }
  @page { size: 6in 9in; margin: 0.75in 0.7in 0.8in; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Cormorant', serif; font-weight: 500; color: #2b2520; font-size: 14pt; line-height: 1.5; }
  .pag { page-break-after: always; }
  .portada { height: 7.4in; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .portada h1 { font-size: 46pt; font-weight: 600; line-height: 1; margin: 0 0 14pt; }
  .portada h2 { font-style: italic; font-weight: 500; font-size: 17pt; margin: 0 0 40pt; color: #5d5147; }
  .portada p, .sello { font-family: 'Jost'; font-size: 9pt; letter-spacing: .2em; text-transform: uppercase; color: #7b6d60; }
  h2.sec { font-size: 26pt; font-weight: 600; margin: 0 0 14pt; }
  .dia-num { font-family: 'Jost'; font-size: 9pt; letter-spacing: .25em; text-transform: uppercase; color: #8a7a62; }
  .dia h3 { font-size: 24pt; font-weight: 600; line-height: 1.1; margin: 4pt 0 14pt; }
  .verso { border-left: 2px solid #c9b79c; padding: 2pt 0 2pt 12pt; font-style: italic; color: #4d433a; margin: 0 0 14pt; }
  .verso b { display: block; font-style: normal; font-family: 'Jost'; font-weight: 500; font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #8a7a62; margin-top: 4pt; }
  .oracion { background: #f5eee4; border-radius: 6pt; padding: 10pt 12pt; font-style: italic; margin: 12pt 0; }
  .etq { font-family: 'Jost'; font-size: 8.5pt; letter-spacing: .2em; text-transform: uppercase; color: #8a7a62; display: block; margin-bottom: 3pt; font-style: normal; }
  .paso { border-top: 1px solid #e2d5c4; padding-top: 8pt; }
  .semana { height: 7.4in; display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .semana h2 { font-size: 30pt; font-weight: 600; margin: 6pt 0; }
  .nota { font-size: 11.5pt; color: #5d5147; }
  ol.indice { padding-left: 18pt; } ol.indice li { margin: 2pt 0; }`;
}

function htmlLibro(dias) {
  const semanas = [...new Set(dias.map(d => d.semana))];
  let html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${estilos()}</style></head><body>
  <section class="pag portada"><h1>${esc(LIBRO.titulo)}</h1><h2>${esc(LIBRO.subtitulo)}</h2><p>${esc(LIBRO.autorPersona)}</p><p>${esc(LIBRO.autor)}</p></section>
  <section class="pag"><h2 class="sec">Antes de empezar</h2>
    <p>Si tienes este libro en las manos, es probable que conozcas bien esa sensación: el pecho apretado, la mente que no para, las noches que se hacen largas. No estás solo, y no eres menos creyente por sentirte así.</p>
    <p>Durante 30 días vas a caminar con Jesús de Nazaret, el Rey de reyes, por las preocupaciones más comunes de la vida: el dinero, el trabajo, la familia, la salud, la soledad. Cada día tiene una lectura breve, un versículo de la Biblia (Reina-Valera 1909), una oración para decir en voz alta y un paso pequeño para hoy.</p>
    <p><b>Cómo usarlo:</b> un día cada mañana o cada noche, en 10 minutos. Si un día te falla, no pasa nada: retoma donde lo dejaste. Subraya, escribe en los márgenes, vuelve a los días que más te hablen.</p>
    <p class="nota"><b>Importante:</b> este devocional acompaña tu fe; no reemplaza la ayuda de un médico ni de un profesional de salud mental. Si la ansiedad no te deja vivir, buscar ayuda también es un acto de fe. En Estados Unidos puedes llamar o escribir al <b>988</b> (atención en español) a cualquier hora.</p></section>
  <section class="pag"><h2 class="sec">Los 30 días</h2><ol class="indice">${dias.map(d => `<li>${esc(d.titulo)}</li>`).join('')}</ol></section>`;
  dias.forEach((d, i) => {
    const s = semanas.indexOf(d.semana);
    if (i === 0 || dias[i - 1].semana !== d.semana) {
      html += `<section class="pag semana"><p class="sello">Parte ${s + 1}</p><h2>${esc(d.semana)}</h2></section>`;
    }
    html += `<section class="pag dia"><span class="dia-num">Día ${i + 1}</span><h3>${esc(d.titulo)}</h3>
      <p class="verso">“${esc(d.versiculo.texto)}”<b>${esc(d.versiculo.cita)} · RV1909</b></p>
      ${d.reflexion.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/).reduce((ps, f) => { const u = ps.at(-1); if (u && u.split(' ').length < 60) ps[ps.length - 1] = `${u} ${f}`; else ps.push(f); return ps; }, []).map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="oracion"><span class="etq">Oración</span>${esc(d.oracion)}</div>
      <p class="paso"><span class="etq">Tu paso de hoy</span>${esc(d.paso)}</p></section>`;
  });
  html += `<section class="pag"><h2 class="sec">Y ahora, sigue caminando</h2>
    <p>Treinta días después, la ansiedad puede volver a tocar la puerta. Pero ya sabes algo nuevo: no tienes que abrirle sola o solo. Jesús de Nazaret, el Rey de reyes, sigue reinando sobre cada pensamiento, cada cuenta y cada noche.</p>
    <p>Vuelve a este libro cuando lo necesites. Y si quieres orar con nosotros cada día, nos encuentras como <b>${esc(LIBRO.usuario)}</b> en Instagram y Facebook, y como <b>${esc(LIBRO.autor)}</b> en YouTube: una oración nueva cada mañana y cada noche.</p>
    <p><i>Que la paz de Dios, que sobrepuja todo entendimiento, guarde tu corazón. Amén.</i></p>
    <p class="sello" style="margin-top:40pt">Versículos: Reina-Valera 1909 (dominio público).<br>Autor: ${esc(LIBRO.autorPersona)} · ${esc(LIBRO.autor)}.<br>© 2026 ${esc(LIBRO.autorPersona)}. Todos los derechos reservados. Uso personal: no se permite copiar ni compartir este archivo.</p></section></body></html>`;
  return html;
}

function htmlPortada() {
  const f = n => `file://${path.join(FUENTES, n)}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-VF.ttf')}'); font-weight: 300 700; }
  @font-face { font-family: 'Cormorant'; src: url('${f('CormorantGaramond-Italic-VF.ttf')}'); font-style: italic; font-weight: 300 700; }
  @font-face { font-family: 'Jost'; src: url('${f('Jost-VF.ttf')}'); font-weight: 100 900; }
  html, body { margin: 0; width: 1600px; height: 2400px; }
  body { position: relative; overflow: hidden; color: #fdf6ea; font-family: 'Cormorant', serif;
    background: radial-gradient(ellipse at 50% 30%, #f3c77a 0%, #c98a3e 18%, #5a3a24 48%, #1d1611 80%); }
  .luz { position: absolute; left: 50%; top: 0; width: 900px; height: 1500px; margin-left: -450px;
    background: linear-gradient(180deg, rgba(255,240,200,.55), rgba(255,240,200,0)); filter: blur(40px); clip-path: polygon(40% 0, 60% 0, 100% 100%, 0 100%); }
  .cruz { position: absolute; left: 50%; top: 360px; width: 26px; height: 300px; margin-left: -13px; background: #fff3d6; box-shadow: 0 0 60px rgba(255,236,190,.9); border-radius: 4px; }
  .cruz::after { content: ''; position: absolute; left: -77px; top: 80px; width: 180px; height: 26px; background: #fff3d6; border-radius: 4px; }
  .txt { position: absolute; left: 120px; right: 120px; top: 900px; text-align: center; text-shadow: 0 4px 30px rgba(0,0,0,.45); }
  h1 { font-size: 250px; font-weight: 600; line-height: .95; margin: 0; }
  h2 { font-size: 92px; font-style: italic; font-weight: 500; line-height: 1.12; margin: 60px 0 0; }
  .marca { position: absolute; bottom: 140px; width: 100%; text-align: center; font-family: 'Jost'; font-size: 40px; letter-spacing: .28em; text-transform: uppercase; color: #f1dfbf; }
  </style></head><body><div class="luz"></div><div class="cruz"></div>
  <div class="txt"><h1>${esc(LIBRO.titulo)}</h1><h2>${esc(LIBRO.subtitulo)}</h2></div>
  <div class="marca">${esc(LIBRO.autor)}</div></body></html>`;
}

function textoTienda(dias) {
  return `${LIBRO.titulo}: ${LIBRO.subtitulo}
Precio sugerido: $10

¿Te cuesta dormir porque tu mente no para? ¿Las cuentas, el trabajo o la familia te pesan más de lo que puedes cargar?

"${LIBRO.titulo}" es un devocional de 30 días para caminar con Jesús de Nazaret, el Rey de reyes, por las preocupaciones más comunes de la vida. Cada día, en solo 10 minutos:
• Un versículo de la Biblia (Reina-Valera 1909)
• Una reflexión cercana, con situaciones reales de todos los días
• Una oración para decir en voz alta
• Un paso pequeño y práctico para hoy

Incluye:
${[...new Set(dias.map(d => d.semana))].map((s, i) => `• Parte ${i + 1}: ${s}`).join('\n')}

Libro digital en PDF (${dias.length} días). Lo descargas al instante y lo lees en el teléfono, la tableta o impreso.

Este devocional acompaña tu fe; no sustituye la ayuda de un médico o profesional de salud mental.`;
}

async function main() {
  const salida = process.argv[2] || path.join(process.cwd(), 'temp', 'ebook');
  fs.mkdirSync(salida, { recursive: true });
  const biblia = cargaBiblia();
  const contenido = path.join(salida, 'contenido.json');
  let dias;
  if (fs.existsSync(contenido)) {
    dias = JSON.parse(fs.readFileSync(contenido, 'utf8'));
    console.log(`Usando ${contenido} (bórralo para volver a escribir).`);
  } else {
    // Se guarda tras cada tanda: si el contenedor se reinicia, se retoma desde ahí.
    const parcial = path.join(salida, 'contenido.parcial.json');
    const previos = fs.existsSync(parcial) ? JSON.parse(fs.readFileSync(parcial, 'utf8')) : [];
    if (previos.length) console.log(`Retomando desde el día ${previos.length + 1}`);
    dias = await escribeDias(new AITextService({}), biblia, { dias: previos, guarda: d => fs.writeFileSync(parcial, JSON.stringify(d, null, 2)) });
    fs.writeFileSync(contenido, JSON.stringify(dias, null, 2));
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    // Desde un archivo (no setContent): si no, Chromium bloquea las fuentes file:// y sale Times.
    const abre = async (pagina, html, nombre) => {
      const ruta = path.join(salida, nombre);
      fs.writeFileSync(ruta, html);
      await pagina.goto(`file://${ruta}`, { waitUntil: 'load' });
      fs.unlinkSync(ruta);
    };
    const page = await browser.newPage();
    await abre(page, htmlLibro(dias), '_libro.html');
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(salida, 'ebook.pdf'), width: '6in', height: '9in', printBackground: true, preferCSSPageSize: true });
    const tapa = await browser.newPage({ viewport: { width: 1600, height: 2400 } });
    await abre(tapa, htmlPortada(), '_portada.html');
    await tapa.evaluate(() => document.fonts.ready);
    await tapa.screenshot({ path: path.join(salida, 'portada.jpg'), type: 'jpeg', quality: 90 });
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(salida, 'tienda.txt'), textoTienda(dias));
  console.log(`Listo: ${salida}/ebook.pdf, portada.jpg, tienda.txt`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

module.exports = { LIBRO, prompt, valida, htmlLibro, textoTienda };
