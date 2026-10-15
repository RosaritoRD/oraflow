const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const run = promisify(execFile);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v']);

function tokens(text) {
  return new Set(String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []);
}

function orientationMatches(width, height, orientation) {
  if (!(width > 0 && height > 0)) return true;
  if (orientation === 'portrait') return height > width;
  if (orientation === 'square') return Math.abs(width / height - 1) < 0.1;
  return orientation !== 'landscape' || width > height;
}

function safeRemoteUrl(value, source) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid stock media URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Stock media requires a public HTTPS provider URL');
  const domains = source === 'pexels'
    ? ['images.pexels.com', 'videos.pexels.com', 'player.vimeo.com', 'vimeocdn.com', 'akamaized.net']
    : source === 'adobe_stock' ? ['stock.adobe.com', 'stock.adobe.io', 'ftcdn.net'] : [];
  if (!domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error('Stock media URL is outside the provider CDN');
  return url;
}

async function requestJSON(url, { headers = {}, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal, redirect: 'error' });
    if (!response.ok) throw new Error(`Stock API HTTP ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); controller.abort(); }
}

// Revalidate every redirect and never forward API keys to a CDN.
async function withRemoteBody(url, source, { fetchImpl = globalThis.fetch, maxBytes = 250 * 1024 * 1024, timeoutMs = 60000 } = {}, consume) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = safeRemoteUrl(url, source);
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      const response = await fetchImpl(current.href, { redirect: 'manual', signal: controller.signal });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel?.();
        if (!location) throw new Error('Stock download redirect has no location');
        current = safeRemoteUrl(new URL(location, current).href, source);
        continue;
      }
      if (!response.ok) throw new Error(`Stock download HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (/text\/|application\/(json|xml|xhtml)/i.test(contentType)) throw new Error('Stock response is not media');
      if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Stock download exceeds size limit');
      if (!response.body) throw new Error('Stock download has no body');
      let received = 0;
      const limiter = new Transform({ transform(chunk, encoding, callback) {
        received += chunk.length;
        callback(received > maxBytes ? new Error('Stock download exceeds size limit') : null, chunk);
      } });
      const stream = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body;
      return await consume(stream, limiter);
    }
    throw new Error('Too many stock download redirects');
  } finally { clearTimeout(timer); controller.abort(); }
}

async function downloadFile(url, source, destination, options) {
  return withRemoteBody(url, source, options, (stream, limiter) => pipeline(stream, limiter, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })));
}

async function downloadBuffer(url, source, options = {}) {
  return withRemoteBody(url, source, { maxBytes: 3 * 1024 * 1024, timeoutMs: 8000, ...options }, async (stream, limiter) => {
    const chunks = [];
    const sink = new Transform({ transform(chunk, encoding, callback) { chunks.push(chunk); callback(); } });
    await pipeline(stream, limiter, sink);
    return Buffer.concat(chunks);
  });
}

async function probeMedia(file, type) {
  const { stdout } = await run(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-show_format', '-of', 'json', file
  ], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const info = JSON.parse(stdout);
  const stream = (info.streams || []).find(item => item.codec_type === 'video' && item.width > 0 && item.height > 0);
  if (!stream) throw new Error('Stock asset has no decodable visual stream');
  const durationSec = Number(info.format?.duration || stream.duration) || null;
  if (type === 'video' && !(durationSec > 0)) throw new Error('Stock video has no valid duration');
  if (type === 'image' && !/^(mjpeg|jpeg2000|png|webp|bmp|tiff|gif|av1)$/.test(stream.codec_name || '')) throw new Error('Stock image contains an unsupported visual codec');
  return { width: stream.width, height: stream.height, durationSec: type === 'video' ? durationSec : null };
}

function differenceHash(pixels) {
  if (!pixels || pixels.length !== 72) throw new Error('differenceHash requires 9 x 8 grayscale pixels');
  let value = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) value = (value << 1n) | (pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? 1n : 0n);
  }
  return value.toString(16).padStart(16, '0');
}

async function hashMedia(file) {
  const { stdout } = await run(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', file, '-vf', 'scale=9:8,format=gray', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'
  ], { timeout: 12000, maxBuffer: 1024 * 1024, encoding: 'buffer' });
  return differenceHash(stdout);
}

async function hashImageBuffer(buffer) {
  const sharp = require('../safe-sharp');
  const pixels = await sharp(buffer, { limitInputPixels: 40000000 }).resize(9, 8, { fit: 'fill' }).greyscale().removeAlpha().raw().toBuffer();
  return differenceHash(pixels);
}

function mediaExtension(asset) {
  const candidate = path.extname(String(asset.url || '').split('?')[0]).toLowerCase();
  return (asset.type === 'video' ? VIDEO_EXT : IMAGE_EXT).has(candidate) ? candidate : asset.type === 'video' ? '.mp4' : '.jpg';
}

module.exports = { IMAGE_EXT, VIDEO_EXT, tokens, orientationMatches, safeRemoteUrl, requestJSON, downloadFile, downloadBuffer, probeMedia, differenceHash, hashMedia, hashImageBuffer, mediaExtension };
