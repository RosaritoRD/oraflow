/**
 * Instala las fuentes de data/assets/fuentes/ en ~/.local/share/fonts al
 * arrancar (03/10/2026). Las miniaturas y portadas se pintan con SVG vía
 * sharp/librsvg, que solo ve las fuentes de fontconfig: sin esto, «Oswald»
 * caía en silencio a Liberation Sans y el titular salía ancho y pequeño.
 * Tiene que correr ANTES del primer texto renderizado (fontconfig lee los
 * directorios al iniciarse). Nunca lanza: sin fuentes, se usa el respaldo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

function instalaFuentes({
  origen = path.join(__dirname, '..', 'data', 'assets', 'fuentes'),
  destino = path.join(os.homedir(), '.local', 'share', 'fonts', 'oraflow')
} = {}) {
  try {
    const nombres = fs.readdirSync(origen).filter(n => /\.(ttf|otf)$/i.test(n));
    if (!nombres.length) return 0;
    fs.mkdirSync(destino, { recursive: true });
    let copiadas = 0;
    for (const n of nombres) {
      const a = path.join(origen, n);
      const b = path.join(destino, n);
      const sa = fs.statSync(a);
      const sb = fs.existsSync(b) ? fs.statSync(b) : null;
      if (!sb || sb.size !== sa.size) { fs.copyFileSync(a, b); copiadas += 1; }
    }
    return copiadas;
  } catch {
    return 0;
  }
}

module.exports = { instalaFuentes };
