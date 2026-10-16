// 11/10/2026: the thumbnails and covers the owner makes are picked by topic.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { eligeDeBiblioteca, candidatos, TEMAS, POR_DEFECTO } = require('../../utils/biblioteca-miniaturas');

const silencio = { info() {}, warn() {} };
function raiz(largos, cortos) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-'));
  for (const [d, l] of [['miniaturas-propias', largos], ['portadas-propias', cortos]]) {
    fs.mkdirSync(path.join(r, d));
    for (const s of l) fs.writeFileSync(path.join(r, d, `${s}.jpg`), 'x');
  }
  return r;
}

test('the title\'s topic picks the image; the fallback only if the topic has none', async () => {
  const r = raiz(['antes-de-dormir', 'oracion-de-la-manana', 'entrega-tu-ansiedad'], ['calma-mi-mente', 'buenos-dias-dios']);
  assert.equal((await eligeDeBiblioteca({ title: 'Oración de la noche para dormir', raiz: r, logger: silencio })).slug, 'antes-de-dormir');
  assert.equal((await eligeDeBiblioteca({ title: 'Oración para soltar la ansiedad', formato: 'short', raiz: r, logger: silencio })).slug, 'calma-mi-mente');
  assert.equal((await eligeDeBiblioteca({ title: 'Oración por un milagro', raiz: r, logger: silencio })).slug, 'oracion-de-la-manana');
  assert.equal(await eligeDeBiblioteca({ title: 'x', raiz: fs.mkdtempSync(path.join(os.tmpdir(), 'vacia-')), logger: silencio }), null);
});

test('rotates within the topic without repeating the last one', async () => {
  const r = raiz(['no-temas', 'dios-tiene-el-control'], []);
  const a = (await eligeDeBiblioteca({ title: 'Oración para vencer el miedo', raiz: r, logger: silencio })).slug;
  const b = (await eligeDeBiblioteca({ title: 'Oración para vencer el miedo', raiz: r, logger: silencio })).slug;
  assert.notEqual(a, b);
});

test('«milagro» and «sanidad» only come out if the video is about that', async () => {
  const r = raiz(['milagro-urgente', 'sanidad-poderosa', 'oracion-de-la-manana'], []);
  const { lista } = await candidatos({ title: 'Oración de la mañana para confiar tu día a Dios', raiz: r });
  assert.ok(!lista.includes('milagro-urgente') && !lista.includes('sanidad-poderosa'));
});

test('every name in the map exists in the real library (if mounted)', () => {
  const real = path.join(__dirname, '..', '..', 'data', 'assets');
  if (!fs.existsSync(path.join(real, 'miniaturas-propias'))) return;
  for (const [idx, d, def] of [[1, 'miniaturas-propias', POR_DEFECTO.largo], [2, 'portadas-propias', POR_DEFECTO.short]]) {
    const hay = new Set(fs.readdirSync(path.join(real, d)).map(n => n.replace(/\.\w+$/, '')));
    for (const s of [...TEMAS.flatMap(t => t[idx]), ...def]) assert.ok(hay.has(s), `${d}/${s}`);
  }
});
