/**
 * Página de enlaces propia para la bio (05/10/2026), pública en /enlaces.
 * Sustituye a Linktree (que metía anuncios ajenos). Estilo de /libro.
 * Cada botón pasa por /enlaces/ir/<id> para contar los clics (setting enlaces_clics).
 */
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ENLACES = [
  { id: 'hoy', texto: '🙏 Oración de hoy', sub: 'El vídeo nuevo de YouTube', url: '/hoy', principal: true },
  { id: 'libro', texto: '📖 30 días de paz · $10', sub: 'Devocional para la ansiedad', url: '/libro', principal: true },
  { id: 'youtube', texto: '▶️ Suscríbete en YouTube', sub: 'Una oración cada mañana y cada noche', url: 'https://www.youtube.com/@tu-canal?sub_confirmation=1' },
  { id: 'instagram', texto: 'Instagram', sub: '@tu_cuenta', url: 'https://www.instagram.com/tu_cuenta' },
  { id: 'facebook', texto: 'Facebook', sub: 'Oraciones en Presencia de Yeshua', url: 'https://www.facebook.com/profile.php?id=ID_DE_TU_PAGINA_DE_FACEBOOK' }
];

const destino = id => ENLACES.find(e => e.id === id)?.url || null;

function paginaEnlaces() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Oraciones en Presencia de Yeshua</title>
<meta name="description" content="Una oración cada mañana y cada noche en el nombre de Jesús de Nazaret, el Rey de reyes.">
<meta property="og:title" content="Oraciones en Presencia de Yeshua"><meta property="og:image" content="https://tu-dominio.com/libro/portada.jpg">
<style>
@font-face { font-family: 'Cormorant'; src: url('/libro/f/CormorantGaramond-VF.ttf'); font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'Cormorant'; src: url('/libro/f/CormorantGaramond-Italic-VF.ttf'); font-style: italic; font-weight: 300 700; font-display: swap; }
@font-face { font-family: 'Jost'; src: url('/libro/f/Jost-VF.ttf'); font-weight: 100 900; font-display: swap; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; color: #fdf6ea; font-family: 'Jost', sans-serif;
  background: radial-gradient(ellipse at 50% 0%, #c98a3e 0%, #5a3a24 40%, #1d1611 80%) fixed #1d1611; }
main { max-width: 480px; margin: 0 auto; padding: 44px 16px 40px; text-align: center; }
.cruz { position: relative; width: 14px; height: 70px; margin: 0 auto 20px; background: #fff3d6; border-radius: 3px; box-shadow: 0 0 40px rgba(255,236,190,.9); }
.cruz::after { content: ''; position: absolute; left: -18px; top: 18px; width: 50px; height: 14px; background: #fff3d6; border-radius: 3px; }
h1 { font: 600 34px/1.05 'Cormorant', serif; margin: 0 0 8px; }
.lema { font: italic 500 19px 'Cormorant', serif; color: #f1dfbf; margin: 0 0 28px; }
a.boton { display: block; margin: 12px 0; padding: 15px 18px; border-radius: 16px; text-decoration: none; color: #fdf6ea;
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.18); }
a.boton.principal { background: #f4c46b; color: #1d1611; border-color: #f4c46b; }
a.boton b { display: block; font-weight: 600; font-size: 17px; }
a.boton span { display: block; font-size: 13px; opacity: .8; margin-top: 2px; }
footer { margin-top: 30px; font: italic 500 16px 'Cormorant', serif; color: #e8d8bd; }
</style></head><body><main>
<div class="cruz" aria-hidden="true"></div>
<h1>Oraciones en Presencia de Yeshua</h1>
<p class="lema">Una oración cada mañana y cada noche en el nombre de Jesús de Nazaret, el Rey de reyes</p>
${ENLACES.map(e => `<a class="boton${e.principal ? ' principal' : ''}" href="/enlaces/ir/${e.id}" rel="noopener"><b>${esc(e.texto)}</b><span>${esc(e.sub)}</span></a>`).join('\n')}
<footer>Escribe «Amén» en nuestras publicaciones y oramos por ti 🙏</footer>
</main></body></html>`;
}

/** Suma un clic al contador del día (para ver qué funciona). */
async function cuentaClic(db, id, now = new Date()) {
  const dia = now.toISOString().slice(0, 10);
  const c = JSON.parse(await db.getSetting('enlaces_clics') || '{}');
  c[dia] = c[dia] || {};
  c[dia][id] = (c[dia][id] || 0) + 1;
  const dias = Object.keys(c).sort().slice(-60);
  await db.setSetting('enlaces_clics', JSON.stringify(Object.fromEntries(dias.map(d => [d, c[d]]))));
}

module.exports = { ENLACES, destino, paginaEnlaces, cuentaClic };
