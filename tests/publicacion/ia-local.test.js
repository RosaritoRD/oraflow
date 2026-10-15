// IA local: qwen3 en la PC del autor (Ollama por Tailscale, 07/10/2026).
// Las tareas sencillas la prueban primero; si la PC está apagada o tarda, se
// usa el proveedor de siempre y el trabajo sale igual.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { AITextService } = require('../../utils/ai-text-service');

function ollamaFalso(responder) {
  const peticiones = [];
  const server = http.createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (c) => { cuerpo += c; });
    req.on('end', () => {
      peticiones.push({ url: req.url, cuerpo: cuerpo ? JSON.parse(cuerpo) : null });
      responder(req, res, peticiones.length);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({
    url: `http://127.0.0.1:${server.address().port}`,
    peticiones,
    cierra: () => new Promise((c) => server.close(c)),
  })));
}

function servicio(url, extra = {}) {
  const s = new AITextService({}, { local: { url, model: 'qwen3:8b', timeoutMs: 1500, ...extra } });
  // El proveedor de siempre, falso: si se llama, se nota.
  s.client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'DE LA NUBE' } }] }) } } };
  s.model = 'gpt-test';
  s.providerName = 'Nube';
  return s;
}

test('con local: true y la PC encendida, contesta qwen3 sin pensar y en JSON', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: '{"ok":true}' } })));
  const s = servicio(o.url);
  const texto = await s.generateText('clasifica', { local: true, json: true, temperature: 0.2, maxTokens: 500 });
  await o.cierra();
  assert.equal(texto, '{"ok":true}');
  assert.equal(s.ultimoProveedor, 'local');
  const p = o.peticiones[0];
  assert.equal(p.url, '/api/chat');
  assert.equal(p.cuerpo.model, 'qwen3:8b');
  assert.equal(p.cuerpo.think, false);
  assert.equal(p.cuerpo.format, 'json');
  assert.equal(p.cuerpo.stream, false);
  assert.equal(p.cuerpo.options.temperature, 0.2);
  assert.equal(p.cuerpo.options.num_predict, 500);
});

test('sin local: true no se toca la PC', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = servicio(o.url);
  assert.equal(await s.generateText('guion largo'), 'DE LA NUBE');
  await o.cierra();
  assert.equal(o.peticiones.length, 0);
});

test('PC apagada: se usa la nube y la PC se deja en paz un rato', async () => {
  const s = servicio('http://127.0.0.1:9'); // nadie escucha
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.equal(s.ultimoProveedor, 'Nube');
  assert.ok(s.localCaidoHasta > Date.now(), 'tras un fallo se espera antes de volver a probar');
});

test('PC lenta: se corta al plazo y sale por la nube', async () => {
  const o = await ollamaFalso(() => { /* no contesta nunca */ });
  const s = servicio(o.url, { timeoutMs: 200 });
  const t0 = Date.now();
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.ok(Date.now() - t0 < 1500);
  await o.cierra().catch(() => {});
});

test('respuesta vacía o error de Ollama: nube', async () => {
  const o = await ollamaFalso((req, res, n) => {
    if (n === 1) { res.statusCode = 500; return res.end('{"error":"model not found"}'); }
    res.end(JSON.stringify({ message: { content: '   ' } }));
  });
  const s = servicio(o.url);
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  s.localCaidoHasta = 0;
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  await o.cierra();
});

test('después de la pausa vuelve a probar la PC', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = servicio(o.url);
  s.localCaidoHasta = Date.now() + 60_000;
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.equal(o.peticiones.length, 0);
  s.localCaidoHasta = Date.now() - 1;
  assert.equal(await s.generateText('x', { local: true }), 'LOCAL');
  await o.cierra();
});

test('sin LOCAL_LLM_URL no hay IA local', async () => {
  const s = new AITextService({}, { local: { url: '' } });
  s.client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'DE LA NUBE' } }] }) } } };
  s.model = 'gpt-test';
  assert.equal(s.tieneLocal(), false);
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
});

test('solo local (sin nube configurada) también sirve', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = new AITextService({}, { local: { url: o.url, model: 'qwen3:8b' } });
  s.client = null; s.gemini = null;
  assert.equal(await s.generateText('x', { local: true }), 'LOCAL');
  await o.cierra();
});

test('el análisis de comentarios pide la IA local, en JSON', async () => {
  const { AudienceEngagementService } = require('../../utils/audience-engagement-service');
  let opciones = null;
  const db = {
    listAudienceComments: async () => [{ commentId: 'c1', text: 'Amén', likeCount: 0 }],
    setAudienceCommentAnalysis: async () => {},
    saveEngagementInsight: async (i) => i,
    getEngagementInsight: async () => null,
  };
  const s = new AudienceEngagementService(db, null, {
    isAvailable: () => true,
    generateText: async (_p, o) => { opciones = o; return '{"comments":[{"commentId":"c1","sentiment":"positive","flags":["praise"]}],"themes":[]}'; },
  }, {});
  s.refreshAudienceRecommendations = async () => {};
  const insight = await s.analyzeVideo('v1');
  assert.equal(insight.analysisMethod, 'ai');
  assert.equal(opciones.local, true);
  assert.equal(opciones.json, true);
});
