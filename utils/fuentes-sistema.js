/**
 * Installs the fonts in data/assets/fuentes/ into ~/.local/share/fonts at
 * startup (03/10/2026). Thumbnails and covers are drawn with SVG via
 * sharp/librsvg, which only sees fontconfig's fonts: without this, «Oswald»
 * silently fell back to Liberation Sans and the headline came out wide and
 * small.
 * It has to run BEFORE the first rendered text (fontconfig reads the
 * directories when it starts). Never throws: without fonts, the fallback is
 * used.
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
