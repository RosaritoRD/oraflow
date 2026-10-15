const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');

const MAX_AUDIO_BYTES = 128 * 1024 * 1024;

/** Local voice service client. No cloud fallback and no automatic POST retry:
 * a timed-out request may still be rendering on the server.
 */
class LocalTTSClient {
  constructor(options = {}) {
    const env = options.env || process.env;
    this.baseUrl = new URL(options.baseUrl || env.LOCAL_TTS_URL || 'http://voz-studio:8090');
    if (!['http:', 'https:'].includes(this.baseUrl.protocol) || this.baseUrl.username ||
        this.baseUrl.password || this.baseUrl.search || this.baseUrl.hash || this.baseUrl.pathname !== '/') {
      throw new Error('LOCAL_TTS_URL must be an HTTP(S) origin without credentials, a path or a query');
    }
    this.engine = options.engine || env.LOCAL_TTS_ENGINE || 'kokoro';
    this.voice = options.voice ?? (env.LOCAL_TTS_VOICE || null);
    this.speed = Number(options.speed ?? (env.LOCAL_TTS_SPEED || 0.92));
    this.timeoutMs = Number(options.timeoutMs ?? (env.LOCAL_TTS_TIMEOUT_MS || 1200000));
    if (!Number.isFinite(this.speed) || this.speed < 0.5 || this.speed > 1.5) {
      throw new Error('LOCAL_TTS_SPEED must be between 0.5 and 1.5');
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2147483647) {
      throw new Error('LOCAL_TTS_TIMEOUT_MS must be a positive integer, at most 2147483647');
    }
    this.request = options.request || axios;
  }

  async generate(text, outputPath) {
    if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 40000) {
      throw new Error('Local TTS needs between 1 and 40000 characters');
    }
    if (typeof outputPath !== 'string' || !outputPath.trim()) throw new Error('Local TTS needs an output path');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const target = path.resolve(outputPath);
    const temporary = `${target}.${randomUUID()}.part`;
    let createdTemporary = false;
    try {
      const response = await this.request({
        method: 'POST', url: new URL('/api/generar', this.baseUrl).href,
        data: { texto: text, motor: this.engine, voz: this.voice, velocidad: this.speed, formato: 'mp3' },
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        responseType: 'json', timeout: this.timeoutMs, signal: controller.signal,
        maxRedirects: 0, maxContentLength: 1024 * 1024, maxBodyLength: 1024 * 1024,
        proxy: false
      });
      const r = response.data;
      if (response.status !== 200 || !r || r.ok !== true || r.formato !== 'mp3' ||
          typeof r.motor !== 'string' || !r.motor || typeof r.voz !== 'string' || !r.voz ||
          !['duracion_s', 'caracteres', 'segundos_de_proceso', 'velocidad'].every(key =>
            typeof r[key] === 'number' && Number.isFinite(r[key]) && r[key] >= 0) ||
          r.duracion_s <= 0 || r.caracteres <= 0 || r.velocidad < 0.5 || r.velocidad > 1.5) {
        throw new Error('Local TTS returned invalid audio metadata');
      }
      // Only the documented audio endpoint on the configured service may be read.
      // Never use `ruta` (a server filesystem path) or follow provider redirects.
      if (typeof r.url !== 'string' || !/^\/api\/audio\/[a-zA-Z0-9_-]+\.mp3$/.test(r.url)) {
        throw new Error('Local TTS returned an invalid audio URL');
      }
      const audio = await this.request({
        method: 'GET', url: new URL(r.url, this.baseUrl).href,
        headers: { Accept: 'audio/mpeg' }, responseType: 'stream', timeout: this.timeoutMs,
        signal: controller.signal, maxRedirects: 0, proxy: false
      });
      const contentType = String(audio.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (audio.status !== 200 || !['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(contentType)) {
        audio.data?.destroy?.();
        throw new Error('Local TTS download did not return MP3 audio');
      }
      if (Number(audio.headers?.['content-length']) > MAX_AUDIO_BYTES) {
        audio.data?.destroy?.();
        throw new Error('Local TTS audio exceeds the 128 MB download limit');
      }
      let size = 0;
      let header = Buffer.alloc(0);
      const verify = new Transform({
        transform(chunk, _encoding, done) {
          size += chunk.length;
          if (size > MAX_AUDIO_BYTES) return done(new Error('Local TTS audio exceeds the 128 MB download limit'));
          if (header.length < 3) header = Buffer.concat([header, chunk]).subarray(0, 3);
          done(null, chunk);
        },
        flush(done) {
          const mp3 = header.toString('ascii', 0, 3) === 'ID3' ||
            (header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
          if (!mp3 || size < 32) return done(new Error('Local TTS download is empty or is not an MP3'));
          done();
        }
      });
      try {
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        // Create with exclusive access, alongside the destination for atomic rename.
        const handle = await fs.promises.open(temporary, 'wx', 0o600);
        createdTemporary = true;
        await pipeline(audio.data, verify, handle.createWriteStream(), { signal: controller.signal });
      } catch (error) {
        audio.data?.destroy?.();
        throw error;
      }
      await fs.promises.rename(temporary, target);
      return {
        path: outputPath, provider: 'local', model: r.motor, voice: r.voz,
        alignment: null,
        metadata: {
          motor: r.motor, voz: r.voz, velocidad: r.velocidad, duracion_s: r.duracion_s,
          caracteres: r.caracteres, segundos_de_proceso: r.segundos_de_proceso, formato: r.formato
        },
        cost: { provider: 'local', amount: 0, currency: null, invoiceRequired: false }
      };
    } catch (error) {
      error.response?.data?.destroy?.();
      // Axios errors contain request bodies and headers. Expose only actionable
      // status information, never the narration or service credentials.
      if (controller.signal.aborted || ['ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(error.code)) {
        throw new Error('Local TTS timed out; check the voice studio history before retrying');
      }
      if (error.response) throw new Error(`Local TTS request failed (HTTP ${error.response.status})`);
      if (error.isAxiosError) throw new Error('Local TTS is unreachable; check LOCAL_TTS_URL and the voz_default network');
      throw error;
    } finally {
      clearTimeout(timer);
      if (createdTemporary) await fs.promises.unlink(temporary).catch(() => {});
    }
  }
}

/** Drop-in branch for AIVideoGenerator.generateTTSAudio, preserving its return
 * value and lastNarrationResult shape. Claude owns the call site.
 */
async function generateLocalTTSAudio(generator, text, outputPath, options = {}) {
  generator.lastNarrationResult = null;
  generator.lastAlignment = null;
  let client;
  try {
    client = options.client || new LocalTTSClient(options);
    const result = await client.generate(text, outputPath);
    if (typeof generator.isUsableAudioFile === 'function' && !await generator.isUsableAudioFile(result.path)) {
      throw new Error('Local TTS returned audio that could not be decoded');
    }
    generator.lastNarrationResult = {
      status: 'ready', path: result.path, provider: 'local', model: result.model,
      externalTaskId: null, generatedAt: new Date().toISOString(), simulated: false,
      cost: result.cost, metadata: result.metadata
    };
    return result.path;
  } catch (error) {
    generator.lastNarrationResult = {
      status: 'failed', path: null, provider: 'local', model: client?.engine || null,
      externalTaskId: null, generatedAt: new Date().toISOString(), simulated: false,
      error: error.message, cost: { provider: 'local', amount: 0, currency: null, invoiceRequired: false }
    };
    throw error;
  }
}

module.exports = { LocalTTSClient, generateLocalTTSAudio };
