/**
 * Página de venta del ebook "30 días de paz" (05/10/2026), pública en /libro.
 * Hotmart pide una página de ventas para aprobar el producto; el botón lleva
 * al pago de Hotmart (setting `ebook_checkout_url`). Sin URL, el botón dice
 * "Disponible muy pronto". El contenido de muestra sale del propio ebook
 * (data/ebook/contenido.json): nada inventado.
 */
const fs = require('fs');
const path = require('path');

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function paginaLibro({ checkoutUrl = '', muestra = null, partes = [] } = {}) {
  const boton = checkoutUrl
    ? '<a class="comprar" href="/libro/comprar" rel="noopener">Quiero mi devocional · $10</a>' // cuenta el clic y lleva a Hotmart
    : '<span class="comprar apagado">Disponible muy pronto</span>';
  const parrafo = muestra ? muestra.reflexion.split(/(?<=[.!?])\s+/).slice(0, 4).join(' ') : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>30 días de paz · Devocional para la ansiedad</title>
<meta name="description" content="Devocional cristiano de 30 días para cuando la ansiedad no te deja descansar. Un versículo, una reflexión, una oración y un paso práctico cada día.">
<meta property="og:title" content="30 días de paz"><meta property="og:description" content="Devocional para cuando la ansiedad no te deja descansar">
<meta property="og:image" content="https://tu-dominio.com/libro/portada.jpg">
<style>
@font-face { font-family: 'Cormorant'; src: url('/libro/f/CormorantGaramond-VF.ttf'); font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'Cormorant'; src: url('/libro/f/CormorantGaramond-Italic-VF.ttf'); font-style: italic; font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'Jost'; src: url('/libro/f/Jost-VF.ttf'); font-weight: 100 900; font-display: swap; }
:root { --fondo: #fbf6ee; --tinta: #2b2520; --suave: #6d6156; --oro: #b07a35; --oscuro: #1d1611; --caja: #f3e9da; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--fondo); color: var(--tinta); font: 500 19px/1.55 'Cormorant', Georgia, serif; }
.envoltura { max-width: 720px; margin: 0 auto; padding: 0 20px; }
header { background: radial-gradient(ellipse at 50% 0%, #c98a3e 0%, #5a3a24 45%, var(--oscuro) 85%); color: #fdf6ea; padding: 36px 0 48px; text-align: center; }
header img { width: min(260px, 70vw); border-radius: 6px; box-shadow: 0 24px 60px rgba(0,0,0,.5); }
h1 { font-size: clamp(44px, 10vw, 64px); line-height: 1; margin: 26px 0 8px; font-weight: 600; }
.sub { font-style: italic; font-size: 24px; margin: 0 0 26px; color: #f1dfbf; }
.comprar { display: inline-block; background: #f4c46b; color: var(--oscuro); font: 600 18px 'Jost', sans-serif; letter-spacing: .03em;
  padding: 18px 30px; border-radius: 999px; text-decoration: none; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
.comprar.apagado { background: #d9cbb4; box-shadow: none; }
.nota { font: 400 14px 'Jost', sans-serif; color: #e8d8bd; margin-top: 12px; }
section { padding: 40px 0 8px; }
h2 { font-size: 34px; line-height: 1.1; margin: 0 0 16px; font-weight: 600; }
ul.puntos { padding-left: 22px; } ul.puntos li { margin: 6px 0; }
.muestra { background: var(--caja); border-radius: 12px; padding: 22px; }
.muestra .verso { font-style: italic; border-left: 2px solid var(--oro); padding-left: 12px; color: #4d433a; }
.etq { font: 500 12px 'Jost', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--oro); }
.oracion { font-style: italic; }
details { border-bottom: 1px solid #e2d5c4; padding: 12px 0; } summary { cursor: pointer; font-weight: 600; }
.final { text-align: center; padding: 40px 0 60px; }
footer { text-align: center; font: 400 14px 'Jost', sans-serif; color: var(--suave); padding: 24px 0 40px; }
</style></head><body>
<header><div class="envoltura">
  <img src="/libro/portada.jpg" alt="Portada de 30 días de paz">
  <h1>30 días de paz</h1>
  <p class="sub">Devocional para cuando la ansiedad no te deja descansar</p>
  ${boton}
  <p class="nota">Libro digital en PDF · lo recibes al instante en tu correo</p>
</div></header>
<main class="envoltura">
  <section><h2>¿Te pasa esto?</h2><ul class="puntos">
    <li>Te acuestas cansado y tu mente no se apaga.</li>
    <li>Las cuentas, el trabajo o la familia te pesan más de lo que puedes cargar.</li>
    <li>Oras, pero la preocupación vuelve a los cinco minutos.</li>
    <li>Sientes que deberías tener más fe, y eso te pesa todavía más.</li></ul>
    <p>No estás solo, y no eres menos creyente por sentirte así. Este devocional es para caminar 30 días con Jesús de Nazaret, el Rey de reyes, por esas preocupaciones.</p></section>
  <section><h2>Qué incluye</h2><ul class="puntos">
    <li><b>30 días</b> de 10 minutos, por la mañana o por la noche.</li>
    <li>Cada día: <b>un versículo</b> de la Biblia (Reina-Valera 1909), <b>una reflexión</b> con situaciones reales, <b>una oración</b> para decir en voz alta y <b>un paso práctico</b> para hoy.</li>
    ${partes.length ? `<li>${partes.map((p, i) => `Parte ${i + 1}: ${esc(p)}`).join(' · ')}</li>` : ''}
    <li>PDF para leer en el teléfono, la tableta o impreso.</li></ul></section>
  ${muestra ? `<section><h2>Lee el día 1</h2><div class="muestra">
    <span class="etq">Día 1</span><h2 style="font-size:28px;margin:4px 0 12px">${esc(muestra.titulo)}</h2>
    <p class="verso">“${esc(muestra.versiculo.texto)}” <span class="etq">${esc(muestra.versiculo.cita)}</span></p>
    <p>${esc(parrafo)} …</p>
    <span class="etq">Oración</span><p class="oracion">${esc(muestra.oracion)}</p></div></section>` : ''}
  <section><h2>Preguntas</h2>
    <details><summary>¿Cómo lo recibo?</summary><p>Al pagar, Hotmart te envía el PDF a tu correo al instante. Puedes descargarlo cuantas veces quieras.</p></details>
    <details><summary>¿Puedo pagar desde mi país?</summary><p>Sí. Hotmart acepta tarjeta y métodos de pago locales de Latinoamérica y Estados Unidos.</p></details>
    <details><summary>¿Y si no es para mí?</summary><p>Tienes la garantía de Hotmart: si en los primeros 7 días no te sirve, pides el reembolso desde tu cuenta.</p></details>
    <details><summary>¿Sustituye la ayuda de un profesional?</summary><p>No. Este devocional acompaña tu fe; no reemplaza a un médico ni a un profesional de salud mental. Si la ansiedad no te deja vivir, buscar ayuda también es un acto de fe. En Estados Unidos puedes llamar o escribir al 988 (atención en español) a cualquier hora.</p></details>
  </section>
  <section class="final">${boton}</section>
</main>
<footer>Oraciones en Presencia de Yeshua · @tu_cuenta</footer>
</body></html>`;
}

/** Datos de la página: URL de pago (setting) y muestra del día 1 (contenido.json del ebook). */
async function datosPagina({ db, dataDir }) {
  const checkoutUrl = String(await db.getSetting('ebook_checkout_url') || '').trim();
  let dias = [];
  try { dias = JSON.parse(fs.readFileSync(path.join(dataDir, 'ebook', 'contenido.json'), 'utf8')); } catch (_e) { dias = []; }
  return {
    checkoutUrl: /^https:\/\//.test(checkoutUrl) ? checkoutUrl : '',
    muestra: dias[0] || null,
    partes: [...new Set(dias.map(d => d.semana).filter(Boolean))]
  };
}

module.exports = { paginaLibro, datosPagina };
