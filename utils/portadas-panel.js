/**
 * Covers to upload by hand (11/10/2026, the owner): the cover NO longer goes
 * inside the Short (1.5 s of a still image before the voice lowered views). It's
 * still composed and listed here so the owner can set it as the cover on
 * Instagram, Facebook and YouTube from the phone. Page /portadas (with login).
 */
const path = require('path');

const RAICES = [path.join(__dirname, '..', 'data'), path.join(__dirname, '..', 'uploads')];

const json = (t) => { try { return JSON.parse(t || '{}') || {}; } catch { return {}; } };

/** The latest posts (Short and long) with whatever cover image they have. */
async function listaPortadas(db, limite = 14) {
  const filas = await db.getAllRows(
    `SELECT ps.production_id AS id, ps.title, ps.publish_time, ps.youtube_url, ps.metadata, p.assets
       FROM publish_schedule ps JOIN productions p ON p.id = ps.production_id
      WHERE json_extract(ps.metadata, '$.contentFormat') IN ('short', 'long')
      ORDER BY ps.publish_time DESC LIMIT ?`, [limite]);
  return filas.map((f) => {
    const a = json(f.assets);
    const m = json(f.metadata);
    const corto = m.contentFormat === 'short';
    return {
      id: f.id,
      titulo: f.title,
      cuando: f.publish_time,
      formato: corto ? 'short' : 'largo',
      youtube: f.youtube_url || null,
      imagen: (corto ? a.shortCover?.path : a.thumbnail?.path) || null,
      // Long videos (11/10/2026): A/B/C for YouTube Studio's «Test and compare».
      variantes: !corto && Array.isArray(a.thumbnail?.variants)
        ? a.thumbnail.variants.filter((v) => v?.path && /^[ABC]$/.test(v.letra)).map((v) => ({ letra: v.letra, path: v.path }))
        : []
    };
  });
}

/** Only serves files from data/ or uploads/: the path comes from the database, not the browser. */
function rutaSegura(ruta) {
  if (!ruta) return null;
  const r = path.resolve(ruta);
  return RAICES.some((raiz) => r.startsWith(path.resolve(raiz) + path.sep)) ? r : null;
}

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function fecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', { timeZone: 'America/New_York', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function paginaPortadas(items) {
  const tarjetas = items.map((it) => {
    const src = it.imagen ? `/portadas/img/${encodeURIComponent(it.id)}.jpg` : null;
    const nombre = `portada-${it.formato}-${String(it.cuando || '').slice(0, 10)}.jpg`;
    const extra = (it.variantes || []).filter((v) => v.letra !== 'A');
    const variantes = extra.length ? `<p class="nota">Variantes para <b>Probar y comparar</b> en YouTube Studio (la A ya se subió):</p>
${extra.map((v) => {
    const vsrc = `/portadas/img/${encodeURIComponent(it.id)}.jpg?v=${v.letra}`;
    return `<div class="var"><span class="tag">${v.letra}</span><img src="${vsrc}" alt="Variante ${v.letra}" loading="lazy">
<button class="s" data-src="${vsrc}" data-nombre="${esc(nombre.replace('.jpg', `-${v.letra}.jpg`))}">Guardar variante ${v.letra}</button></div>`;
  }).join('\n')}` : '';
    return `<article class="${it.formato}">
<div class="meta"><span class="tag">${it.formato === 'short' ? 'Short / Reel' : 'Vídeo largo'}</span> ${esc(fecha(it.cuando))}</div>
<h2>${esc(it.titulo)}</h2>
${src ? `<img src="${src}" alt="Portada" loading="lazy">
<button class="p" data-src="${src}" data-nombre="${esc(nombre)}">Guardar / compartir portada</button>` : '<p>Sin portada.</p>'}
${variantes}
${it.youtube ? `<a class="b s" href="${esc(it.youtube)}" target="_blank" rel="noopener">Abrir en YouTube</a>` : ''}
</article>`;
  }).join('\n');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portadas</title><style>
body{margin:0;background:#141010;color:#f4ece0;font:16px -apple-system,system-ui,sans-serif;padding:16px;max-width:520px;margin:auto}
h1{font-size:22px;margin:8px 0 4px}h2{font-size:17px;margin:6px 0 10px;line-height:1.3}p{color:#bfb3a3;line-height:1.4}
article{background:#1e1814;border-radius:16px;padding:14px;margin:16px 0}
img{width:100%;border-radius:12px;display:block;background:#000}
article.short img{max-width:300px;margin:auto}
.meta{color:#bfb3a3;font-size:14px}.tag{background:#3a2d20;color:#ffe3a3;border-radius:6px;padding:2px 8px;margin-right:6px}
button,a.b{display:block;width:100%;box-sizing:border-box;margin:10px 0 0;padding:14px;border:0;border-radius:12px;font-size:17px;font-weight:600;text-align:center;text-decoration:none}
.p{background:#f4ece0;color:#1d1611}.s{background:#2a221c;color:#f4ece0}
.nota{font-size:14px;margin:14px 0 6px}.var{margin:10px 0}.var .tag{display:inline-block;margin:0 0 6px}
</style></head><body>
<h1>Portadas</h1>
<p>Los Shorts ya no traen la portada pegada al principio: empiezan hablando. Guarda la imagen y ponla tú de portada: en Instagram «Editar portada → Agregar desde el carrete», en YouTube Shorts «Editar → Portada», en Facebook «Editar → Miniatura».</p>
${tarjetas || '<p>Todavía no hay publicaciones.</p>'}
<script>
// iPhone only allows sharing files if it's requested in the same tap: they're downloaded
// beforehand.
const archivos = {};
document.querySelectorAll('button[data-src]').forEach((b) => {
  fetch(b.dataset.src).then((r) => r.blob()).then((x) => { archivos[b.dataset.src] = new File([x], b.dataset.nombre, { type: 'image/jpeg' }); }).catch(() => {});
  b.onclick = () => {
    const f = archivos[b.dataset.src];
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
    else location.href = b.dataset.src;
  };
});
</script>
</body></html>`;
}

module.exports = { listaPortadas, rutaSegura, paginaPortadas };
