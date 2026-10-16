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
    // The package can be installed WITHOUT its binary (the postinstall download
    // failed or was skipped): then its path doesn't exist and every render died
    // with ENOENT even though the system had ffmpeg (02/10/2026).
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

// 07/10/2026: ffmpeg runs on the owner's PC (utils/ffmpeg-remoto.js) and, if the
// PC isn't there or fails, right here. FFMPEG_REMOTO_URL empty = all local.
const { ClienteTaller } = require('./ffmpeg-remoto');
const taller = new ClienteTaller({ url: process.env.FFMPEG_REMOTO_URL || '' });

async function runFFmpeg(args) {
  if (taller.activo()) {
    try {
      const hecho = await taller.ejecuta(args);
      if (hecho) return hecho;
    } catch (error) {
      // An ffmpeg failure in the workshop doesn't take the PC down for everything else; a network one does, for a while.
      if (error.enTaller) { taller.stats.fallos += 1; taller.stats.ultimoError = error.message.slice(0, 300); } else taller.marcaCaido(error);
      console.warn(`[ffmpeg] the PC could not do it (${error.message.slice(0, 500)}); running on the VPS`);
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
