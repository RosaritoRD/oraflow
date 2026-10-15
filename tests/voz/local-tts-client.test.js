const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Readable } = require('node:stream');
const { LocalTTSClient, generateLocalTTSAudio } = require('../../utils/local-tts-client');
const metadata = require('./fixtures/generation.json');

async function setup(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'local-tts-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const bytes = await fs.readFile(path.join(__dirname, 'fixtures/silence.mp3'));
  const calls = [];
  const request = async config => {
    calls.push(config);
    if (config.method === 'POST') return { status: 200, data: { ...metadata, ...options.metadata } };
    return {
      status: options.audioStatus || 200,
      headers: { 'content-type': 'audio/mpeg', ...options.headers },
      data: options.stream ? options.stream() : Readable.from(options.chunks || [options.bytes || bytes])
    };
  };
  const client = new LocalTTSClient({ env: {}, request, ...options.client });
  return { client, bytes, calls, directory, outputPath: path.join(directory, 'nested', 'voice.mp3') };
}

test('posts the documented contract, downloads MP3 and reports zero provider cost', async t => {
  const f = await setup(t);
  const result = await f.client.generate('Un nuevo día comienza.', f.outputPath);
  assert.deepEqual(await fs.readFile(f.outputPath), f.bytes);
  assert.deepEqual(f.calls[0].data, { texto: 'Un nuevo día comienza.', motor: 'kokoro', voz: null, velocidad: 0.92, formato: 'mp3' });
  assert.equal(f.calls[0].url, 'http://voz-studio:8090/api/generar');
  assert.equal(f.calls[1].url, 'http://voz-studio:8090/api/audio/voz_123.mp3');
  assert.equal(f.calls[0].timeout, 1200000);
  for (const call of f.calls) { assert.equal(call.maxRedirects, 0); assert.equal(call.proxy, false); }
  assert.deepEqual(result.cost, { provider: 'local', amount: 0, currency: null, invoiceRequired: false });
  assert.equal(result.alignment, null);
  assert.equal(result.metadata.duracion_s, 3.25);
  assert.equal(result.path, f.outputPath);
  assert.equal(result.model, 'kokoro');
  assert.equal(result.voice, 'em_alex');
  assert.deepEqual(await fs.readdir(path.dirname(f.outputPath)), ['voice.mp3']);
});

test('environment config selects the local engine, voice, speed and timeout', async t => {
  const f = await setup(t, { client: { env: {
    LOCAL_TTS_URL: 'http://local-voice:9000/', LOCAL_TTS_ENGINE: 'piper',
    LOCAL_TTS_VOICE: 'fixture-voice', LOCAL_TTS_SPEED: '1.12', LOCAL_TTS_TIMEOUT_MS: '600000'
  } } });
  await f.client.generate('Texto', f.outputPath);
  assert.equal(f.calls[0].url, 'http://local-voice:9000/api/generar');
  assert.deepEqual(f.calls[0].data, { texto: 'Texto', motor: 'piper', voz: 'fixture-voice', velocidad: 1.12, formato: 'mp3' });
  assert.equal(f.calls[0].timeout, 600000);
});

test('invalid configuration and text fail before any requests', async t => {
  for (const speed of [0.49, 1.51, NaN, Infinity]) assert.throws(() => new LocalTTSClient({ env: {}, speed }), /SPEED/);
  for (const timeoutMs of [0, -1, NaN, 1.1, 2147483648]) assert.throws(() => new LocalTTSClient({ env: {}, timeoutMs }), /TIMEOUT/);
  for (const baseUrl of ['file:///tmp/audio', 'http://user:pass@host', 'http://host/api', 'http://host/?q=1', 'http://host/#hash']) {
    assert.throws(() => new LocalTTSClient({ env: {}, baseUrl }), /URL/);
  }
  const f = await setup(t);
  for (const input of ['', '  \n ', null, 'x'.repeat(40001)]) await assert.rejects(f.client.generate(input, f.outputPath), /characters/);
  await assert.rejects(f.client.generate('Texto', ''), /output path/);
  assert.equal(f.calls.length, 0);
});

test('accepts 40000 Unicode codepoints without truncating or rewriting text', async t => {
  const f = await setup(t);
  const text = '🌅'.repeat(40000);
  await f.client.generate(text, f.outputPath);
  assert.equal(f.calls[0].data.texto, text);
});

test('rejects external, traversal, query and malformed audio URLs before downloading', async t => {
  for (const url of ['https://other.example/api/audio/voice.mp3', '//other.example/a.mp3', '/api/audio/../secret.mp3',
    '/api/audio/%2e%2e/secret.mp3', '/api/audio/a.mp3?secret=1', '/api/audio/a.wav', '/other/a.mp3', null]) {
    const f = await setup(t, { metadata: { url } });
    await assert.rejects(f.client.generate('Texto', f.outputPath), /audio URL/);
    assert.equal(f.calls.length, 1);
  }
});

test('rejects invalid generation metadata and never downloads or reports success', async t => {
  for (const invalid of [{ ok: false }, { duracion_s: 0 }, { duracion_s: '3' }, { caracteres: -1 },
    { segundos_de_proceso: NaN }, { voz: null }, { formato: 'wav' }, { velocidad: 2 }]) {
    const f = await setup(t, { metadata: invalid });
    await assert.rejects(f.client.generate('Texto', f.outputPath), /metadata/);
    assert.equal(f.calls.length, 1);
  }
});

test('valid MP3 signature may be split across stream chunks', async t => {
  const f = await setup(t);
  const fixture = await setup(t, { chunks: [f.bytes.subarray(0, 1), f.bytes.subarray(1, 2), f.bytes.subarray(2)] });
  await fixture.client.generate('Texto', fixture.outputPath);
  assert.deepEqual(await fs.readFile(fixture.outputPath), f.bytes);
});

test('empty, HTML, oversized and non-audio downloads preserve existing output', async t => {
  for (const invalid of [
    { bytes: Buffer.alloc(0) }, { bytes: Buffer.from('<html>This is an expired login page</html>') },
    { headers: { 'content-type': 'text/html' } }, { headers: { 'content-length': 128 * 1024 * 1024 + 1 } },
    { audioStatus: 302 }
  ]) {
    const f = await setup(t, invalid);
    await fs.mkdir(path.dirname(f.outputPath)); await fs.writeFile(f.outputPath, 'existing audio');
    await assert.rejects(f.client.generate('Texto', f.outputPath), /audio|MP3|limit/);
    assert.equal(await fs.readFile(f.outputPath, 'utf8'), 'existing audio');
    assert.deepEqual(await fs.readdir(path.dirname(f.outputPath)), ['voice.mp3']);
  }
});

test('a broken download cleans temporary files and preserves the old audio', async t => {
  const f = await setup(t, { stream: () => Readable.from((async function* () {
    yield Buffer.from('ID3fixture'); throw new Error('fixture stream interrupted');
  })()) });
  await fs.mkdir(path.dirname(f.outputPath)); await fs.writeFile(f.outputPath, 'old audio');
  await assert.rejects(f.client.generate('Texto', f.outputPath), /interrupted/);
  assert.equal(await fs.readFile(f.outputPath, 'utf8'), 'old audio');
  assert.deepEqual(await fs.readdir(path.dirname(f.outputPath)), ['voice.mp3']);
});

test('HTTP errors have no retry, cloud fallback, or narration leakage', async t => {
  let calls = 0;
  const f = await setup(t, { client: { request: async () => {
    calls++; const error = new Error('private narration diagnostic'); error.response = { status: 503 }; throw error;
  } } });
  await assert.rejects(f.client.generate('Private script', f.outputPath), { message: 'Local TTS request failed (HTTP 503)' });
  assert.equal(calls, 1);
});

test('unreachable service produces a network setup hint', async t => {
  const f = await setup(t, { client: { request: async () => {
    const error = new Error('sensitive config'); error.isAxiosError = true; throw error;
  } } });
  await assert.rejects(f.client.generate('Texto', f.outputPath), /LOCAL_TTS_URL.*voz_default/);
});

test('generation timeout aborts the request without retry', async t => {
  let calls = 0;
  const f = await setup(t, { client: { timeoutMs: 20, request: config => new Promise((_, reject) => {
    calls++; config.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) } });
  await assert.rejects(f.client.generate('Texto', f.outputPath), /timed out.*history/);
  assert.equal(calls, 1);
});

test('download timeout removes partial output', async t => {
  const f = await setup(t, { client: { timeoutMs: 40 }, stream: () => new Readable({
    read() { if (!this.started) { this.started = true; this.push(Buffer.from('ID3')); } }
  }) });
  await assert.rejects(f.client.generate('Texto', f.outputPath), /timed out/);
  assert.deepEqual(await fs.readdir(path.dirname(f.outputPath)), []);
});

test('adapter preserves generateTTSAudio return and narration result contracts', async t => {
  const f = await setup(t);
  const generator = { lastAlignment: { stale: true }, lastNarrationResult: { stale: true }, isUsableAudioFile: async filename => filename === f.outputPath };
  assert.equal(await generateLocalTTSAudio(generator, 'Texto', f.outputPath, { client: f.client }), f.outputPath);
  assert.equal(generator.lastAlignment, null, 'Local TTS must not reuse ElevenLabs timestamps');
  assert.equal(generator.lastNarrationResult.status, 'ready');
  assert.equal(generator.lastNarrationResult.provider, 'local');
  assert.equal(generator.lastNarrationResult.model, 'kokoro');
  assert.equal(generator.lastNarrationResult.simulated, false);
  assert.equal(generator.lastNarrationResult.cost.amount, 0);
  assert.equal(generator.lastNarrationResult.externalTaskId, null);
  assert.ok(Date.parse(generator.lastNarrationResult.generatedAt));
});

test('adapter records failure and does not reuse old alignment or cloud results', async t => {
  const f = await setup(t);
  const generator = { lastAlignment: { stale: true }, lastNarrationResult: { provider: 'elevenlabs' }, isUsableAudioFile: async () => false };
  await assert.rejects(generateLocalTTSAudio(generator, 'Texto', f.outputPath, { client: f.client }), /decoded/);
  assert.equal(generator.lastAlignment, null);
  assert.equal(generator.lastNarrationResult.status, 'failed');
  assert.equal(generator.lastNarrationResult.path, null);
  assert.equal(generator.lastNarrationResult.provider, 'local');
  assert.equal(generator.lastNarrationResult.cost.invoiceRequired, false);
});

test('adapter records configuration errors as local failures', async () => {
  const generator = { lastAlignment: { stale: true } };
  await assert.rejects(generateLocalTTSAudio(generator, 'Texto', '/unused.mp3', { env: {}, speed: 2 }), /SPEED/);
  assert.equal(generator.lastAlignment, null);
  assert.equal(generator.lastNarrationResult.status, 'failed');
  assert.equal(generator.lastNarrationResult.provider, 'local');
});
