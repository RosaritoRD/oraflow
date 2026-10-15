// 29/09/2026: fondos de miniatura hechos a mano (ChatGPT Plus) en vez de la API.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { fondoManual } = require('../../utils/background-picker');

const silencio = { info() {}, warn() {} };
const MANANA = new Date('2026-09-30T08:00:00Z'); // 04:00 NY
const NOCHE = new Date('2026-09-29T22:30:00Z');  // 18:30 NY

function raiz() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'fondos-'));
  fs.mkdirSync(path.join(r, 'manana'));
  fs.mkdirSync(path.join(r, 'noche'));
  return r;
}

test('carpeta vacía → null (sigue el banco de imágenes)', async () => {
  assert.equal(await fondoManual({ cuando: MANANA, logger: silencio, raiz: raiz() }), null);
});

test('usa el más antiguo de su franja y lo mueve a usados/', async () => {
  const r = raiz();
  const viejo = path.join(r, 'noche', 'b.png');
  fs.writeFileSync(viejo, 'x');
  fs.utimesSync(viejo, new Date('2026-01-01'), new Date('2026-01-01'));
  fs.writeFileSync(path.join(r, 'noche', 'a.jpg'), 'x');
  fs.writeFileSync(path.join(r, 'manana', 'm.jpg'), 'x');
  fs.writeFileSync(path.join(r, 'noche', 'notas.txt'), 'x');
  const f = await fondoManual({ cuando: NOCHE, logger: silencio, raiz: r });
  assert.equal(f.origen, 'manual');
  assert.equal(f.momento, 'noche');
  assert.match(path.basename(f.ruta), /b\.png$/);
  assert.ok(fs.existsSync(f.ruta));
  assert.ok(!fs.existsSync(viejo));
  assert.equal(f.quedan, 1);
  assert.ok(fs.existsSync(path.join(r, 'manana', 'm.jpg')), 'la mañana no se toca');
});

test('la hora de mañana toma de manana/', async () => {
  const r = raiz();
  fs.writeFileSync(path.join(r, 'manana', 'm.webp'), 'x');
  const f = await fondoManual({ cuando: MANANA, logger: silencio, raiz: r });
  assert.equal(f.momento, 'manana');
});

test('sin fondos manuales ni IA, la miniatura usa el banco de fotos (no sale sin fondo)', async () => {
  const { fondoDeMiniatura } = require('../../utils/background-picker');
  const r = raiz();
  const prev = { dir: process.env.FONDOS_MANUALES_DIR, ia: process.env.THUMBNAIL_AI };
  process.env.FONDOS_MANUALES_DIR = r;
  process.env.THUMBNAIL_AI = 'off';
  const foto = path.join(r, 'foto.jpg');
  fs.writeFileSync(foto, 'x');
  const stockMedia = {
    isAvailable: async () => true,
    search: async () => [{ id: 'p1', type: 'image', title: 'sunrise over mountain valley', keywords: [] }],
    score: () => 50,
    download: async () => foto
  };
  try {
    const f = await fondoDeMiniatura({ cuando: MANANA, logger: silencio, stockMedia });
    assert.equal(f.ruta, foto);
  } finally {
    if (prev.dir === undefined) delete process.env.FONDOS_MANUALES_DIR; else process.env.FONDOS_MANUALES_DIR = prev.dir;
    if (prev.ia === undefined) delete process.env.THUMBNAIL_AI; else process.env.THUMBNAIL_AI = prev.ia;
  }
});
