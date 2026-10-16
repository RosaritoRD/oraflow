// Local AI: qwen3 on the owner's PC (Ollama over Tailscale, 07/10/2026).
// Simple tasks try it first; if the PC is off or slow, the usual provider is
// used and the work comes out the same.
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
  // The usual provider, faked: if it gets called, it shows.
  s.client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'DE LA NUBE' } }] }) } } };
  s.model = 'gpt-test';
  s.providerName = 'Nube';
  return s;
}

test('with local: true and the PC on, qwen3 answers without thinking and in JSON', async () => {
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

test('without local: true the PC isn\'t touched', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = servicio(o.url);
  assert.equal(await s.generateText('guion largo'), 'DE LA NUBE');
  await o.cierra();
  assert.equal(o.peticiones.length, 0);
});

test('PC off: the cloud is used and the PC is left alone for a while', async () => {
  const s = servicio('http://127.0.0.1:9'); // nadie escucha
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.equal(s.ultimoProveedor, 'Nube');
  assert.ok(s.localCaidoHasta > Date.now(), 'tras un fallo se espera antes de volver a probar');
});

test('slow PC: cut at the deadline and goes through the cloud', async () => {
  const o = await ollamaFalso(() => { /* never answers */ });
  const s = servicio(o.url, { timeoutMs: 200 });
  const t0 = Date.now();
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.ok(Date.now() - t0 < 1500);
  await o.cierra().catch(() => {});
});

test('empty response or Ollama error: cloud', async () => {
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

test('after the pause it tries the PC again', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = servicio(o.url);
  s.localCaidoHasta = Date.now() + 60_000;
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
  assert.equal(o.peticiones.length, 0);
  s.localCaidoHasta = Date.now() - 1;
  assert.equal(await s.generateText('x', { local: true }), 'LOCAL');
  await o.cierra();
});

test('without LOCAL_LLM_URL there\'s no local AI', async () => {
  const s = new AITextService({}, { local: { url: '' } });
  s.client = { chat: { completions: { create: async () => ({ choices: [{ message: { content: 'DE LA NUBE' } }] }) } } };
  s.model = 'gpt-test';
  assert.equal(s.tieneLocal(), false);
  assert.equal(await s.generateText('x', { local: true }), 'DE LA NUBE');
});

test('local only (no cloud configured) works too', async () => {
  const o = await ollamaFalso((req, res) => res.end(JSON.stringify({ message: { content: 'LOCAL' } })));
  const s = new AITextService({}, { local: { url: o.url, model: 'qwen3:8b' } });
  s.client = null; s.gemini = null;
  assert.equal(await s.generateText('x', { local: true }), 'LOCAL');
  await o.cierra();
});

test('comment analysis requests the local AI, in JSON', async () => {
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
