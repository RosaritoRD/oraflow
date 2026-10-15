const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

let cachedPath = null;

/**
 * Resolve the FFmpeg binary to use, in order of preference:
 * 1. FFMPEG_PATH environment variable
 * 2. Bundled binary from the optional ffmpeg-static package
 * 3. `ffmpeg` on the system PATH
 */
function getFFmpegPath() {
  if (cachedPath) {
    return cachedPath;
  }

  if (process.env.FFMPEG_PATH) {
    cachedPath = process.env.FFMPEG_PATH;
    return cachedPath;
  }

  try {
    cachedPath = require('ffmpeg-static');
    // El paquete puede estar instalado SIN su binario (la descarga del
    // postinstall falló o se saltó): entonces su ruta no existe y todo render
    // moría con ENOENT aunque hubiera ffmpeg en el sistema (02/10/2026).
    if (cachedPath && !require('fs').existsSync(cachedPath)) cachedPath = null;
  } catch (error) {
    cachedPath = null;
  }

  cachedPath = cachedPath || 'ffmpeg';
  return cachedPath;
}

async function checkFFmpeg() {
  try {
    await execFileAsync(getFFmpegPath(), ['-version']);
    return true;
  } catch (error) {
    return false;
  }
}

// 07/10/2026: el ffmpeg se hace en el PC del autor (utils/ffmpeg-remoto.js) y,
// si el PC no está o falla, aquí mismo. FFMPEG_REMOTO_URL vacío = todo local.
const { ClienteTaller } = require('./ffmpeg-remoto');
const taller = new ClienteTaller({ url: process.env.FFMPEG_REMOTO_URL || '' });

async function runFFmpeg(args) {
  if (taller.activo()) {
    try {
      const hecho = await taller.ejecuta(args);
      if (hecho) return hecho;
    } catch (error) {
      // Un fallo de ffmpeg en el taller no tumba el PC para lo demás; uno de red sí, un rato.
      if (error.enTaller) { taller.stats.fallos += 1; taller.stats.ultimoError = error.message.slice(0, 300); } else taller.marcaCaido(error);
      console.warn(`[ffmpeg] el PC no pudo (${error.message.slice(0, 500)}); se hace en la VPS`);
    }
    taller.stats.locales += 1;
  }
  return execFileAsync(getFFmpegPath(), args, { maxBuffer: 32 * 1024 * 1024 });
}

function ffmpegInstallHint() {
  const hints = {
    win32: 'winget install Gyan.FFmpeg (then restart your terminal)',
    darwin: 'brew install ffmpeg',
    linux: 'sudo apt install ffmpeg (or your distro equivalent)'
  };

  const platformHint = hints[process.platform] || 'https://ffmpeg.org/download.html';
  return `FFmpeg not found. Install it with: ${platformHint} — or run "npm install" again to fetch the bundled ffmpeg-static binary, or set FFMPEG_PATH to your ffmpeg executable.`;
}

module.exports = { getFFmpegPath, checkFFmpeg, runFFmpeg, ffmpegInstallHint, _taller: taller };
