const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { YouTubeAutomationAgent } = require('../../index');
const { ShortsStudioService } = require('../../utils/shorts-studio-service');

async function servidor(t, { apiKey } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shorts-api-'));
  for (const d of ['entrada/fondos', 'entrada/musica', 'entrada/clipping', 'salida/clipping']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'entrada/lote.txt'), 'Juan 3:16\n');
  fs.writeFileSync(path.join(dir, 'salida/juan-3-16.mp4'), 'VIDEO');
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  const protect = (req, res, next) => (!apiKey || req.get('x-api-key') === apiKey
    ? next() : res.status(401).json({ success: false, error: 'Unauthorized' }));
  const ctx = { app, shortsStudio: new ShortsStudioService({ root: dir }) };
  YouTubeAutomationAgent.prototype.setupShortsAPI.call(ctx, protect);
  const srv = app.listen(0);
  t.after(() => srv.close());
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { dir, base };
}

test('GET /api/shorts returns the status', async t => {
  const { base } = await servidor(t);
  const r = await (await fetch(`${base}/api/shorts`)).json();
  assert.equal(r.success, true);
  assert.equal(r.result.lote, 'Juan 3:16\n');
  assert.equal(r.result.outputs.shorts[0].name, 'juan-3-16.mp4');
});

test('uploading asks to confirm permission and stores the file', async t => {
  const { base, dir } = await servidor(t);
  const sin = await fetch(`${base}/api/shorts/files/fondos`, {
    method: 'PUT', body: 'abc', headers: { 'content-type': 'video/mp4', 'x-file-name': 'a.mp4' }
  });
  assert.equal(sin.status, 400);
  const con = await fetch(`${base}/api/shorts/files/fondos`, {
    method: 'PUT', body: 'abc',
    headers: { 'content-type': 'video/mp4', 'x-file-name': encodeURIComponent('Cielo azul.mp4'), 'x-rights-confirmed': 'true' }
  });
  assert.equal(con.status, 200);
  assert.equal(fs.readFileSync(path.join(dir, 'entrada/fondos/Cielo azul.mp4'), 'utf8'), 'abc');
});

test('routes that change things require the API key', async t => {
  const { base } = await servidor(t, { apiKey: 'secreta' });
  const r = await fetch(`${base}/api/shorts/lote`, {
    method: 'PUT', body: JSON.stringify({ lote: 'x' }), headers: { 'content-type': 'application/json' }
  });
  assert.equal(r.status, 401);
  const ok = await fetch(`${base}/api/shorts/lote`, {
    method: 'PUT', body: JSON.stringify({ lote: 'Salmos 23:1\n' }),
    headers: { 'content-type': 'application/json', 'x-api-key': 'secreta' }
  });
  assert.equal(ok.status, 200);
});

test('media: serves the short and doesn\'t let paths escape the folder', async t => {
  const { base } = await servidor(t);
  const r = await fetch(`${base}/api/shorts/media/shorts/juan-3-16.mp4`);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'VIDEO');
  const fuera = await fetch(`${base}/api/shorts/media/shorts/${encodeURIComponent('../entrada/lote.txt')}`);
  assert.equal(fuera.status, 400);
  const area = await fetch(`${base}/api/shorts/media/raiz/x.mp4`);
  assert.equal(area.status, 400);
});

test('deleting a short and requesting one that doesn\'t exist', async t => {
  const { base, dir } = await servidor(t);
  const r = await fetch(`${base}/api/shorts/files/shorts/juan-3-16.mp4`, { method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.equal(fs.existsSync(path.join(dir, 'salida/juan-3-16.mp4')), false);
  const otra = await fetch(`${base}/api/shorts/files/shorts/juan-3-16.mp4`, { method: 'DELETE' });
  assert.equal(otra.status, 404);
});

test('run with an unknown type is 400, not 500', async t => {
  const { base } = await servidor(t);
  const r = await fetch(`${base}/api/shorts/run`, {
    method: 'POST', body: JSON.stringify({ kind: 'nada' }), headers: { 'content-type': 'application/json' }
  });
  assert.equal(r.status, 400);
});
