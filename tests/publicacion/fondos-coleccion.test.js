// 30/09/2026: colección de fondos que ROTA y se edita gratis en cada uso
// (encuadre y tono; de noche, más oscuro y azulado). Sin gastar en IA.
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const { fondoColeccion, fondoDeMiniatura } = require('../../utils/background-picker');

const silencio = { info() {}, warn() {} };
const MANANA = new Date('2026-09-30T08:00:00Z'); // 04:00 NY
const NOCHE = new Date('2026-09-29T22:30:00Z');  // 18:30 NY

async function coleccion(nombres) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-'));
  fs.mkdirSync(path.join(r, 'coleccion'));
  for (const [i, n] of nombres.entries()) {
    // Degradado distinto por imagen, 1536x1024 como las de IA.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><defs><linearGradient id="g"><stop offset="0" stop-color="#${(20 + i * 30).toString(16)}2010"/><stop offset="1" stop-color="#f0b040"/></linearGradient></defs><rect width="1536" height="1024" fill="url(#g)"/><circle cx="1200" cy="600" r="${150 + i * 20}" fill="#ffe0a0"/></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(path.join(r, 'coleccion', n));
  }
  fs.writeFileSync(path.join(r, 'coleccion', 'LEEME.txt'), 'x');
  return r;
}

const huella = (ruta) => crypto.createHash('sha1').update(fs.readFileSync(ruta)).digest('hex');
const brillo = async (ruta) => (await sharp(ruta).stats()).channels.slice(0, 3).reduce((n, c) => n + c.mean, 0) / 3;

test('sin colección → null', async () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-'));
  assert.equal(await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r }), null);
});

test('rota: usa todas antes de repetir y nunca la misma dos veces seguidas', async () => {
  const r = await coleccion(['a.png', 'b.png', 'c.png']);
  const usadas = [];
  for (let i = 0; i < 6; i++) usadas.push((await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r })).nombre);
  assert.deepEqual(new Set(usadas.slice(0, 3)), new Set(['a.png', 'b.png', 'c.png']));
  for (let i = 1; i < usadas.length; i++) assert.notEqual(usadas[i], usadas[i - 1]);
  assert.ok(fs.existsSync(path.join(r, 'coleccion', 'a.png')), 'el original no se mueve ni se borra');
});

test('sale a 1280x720 y cada uso del mismo fondo queda editado distinto', async () => {
  const r = await coleccion(['solo.png']);
  const f1 = await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r });
  const f2 = await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r });
  const meta = await sharp(f1.ruta).metadata();
  assert.equal(meta.width, 1280);
  assert.equal(meta.height, 720);
  assert.equal(f1.origen, 'coleccion');
  assert.notEqual(huella(f1.ruta), huella(f2.ruta));
});

test('la versión de noche es bastante más oscura que la de mañana', async () => {
  const r1 = await coleccion(['x.png']);
  const r2 = await coleccion(['x.png']);
  const dia = await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r1 });
  const noche = await fondoColeccion({ cuando: NOCHE, logger: silencio, raiz: r2 });
  assert.equal(noche.momento, 'noche');
  assert.ok(await brillo(noche.ruta) < (await brillo(dia.ruta)) * 0.8);
});

test('los fondos de un solo uso (manana/, noche/) van antes que la colección', async () => {
  const r = await coleccion(['a.png']);
  fs.mkdirSync(path.join(r, 'manana'));
  fs.writeFileSync(path.join(r, 'manana', 'especial.jpg'), 'x');
  const prev = { dir: process.env.FONDOS_MANUALES_DIR, ia: process.env.THUMBNAIL_AI };
  process.env.FONDOS_MANUALES_DIR = r;
  process.env.THUMBNAIL_AI = 'off';
  try {
    assert.equal((await fondoDeMiniatura({ cuando: MANANA, logger: silencio })).origen, 'manual');
    assert.equal((await fondoDeMiniatura({ cuando: MANANA, logger: silencio })).origen, 'coleccion');
  } finally {
    if (prev.dir === undefined) delete process.env.FONDOS_MANUALES_DIR; else process.env.FONDOS_MANUALES_DIR = prev.dir;
    if (prev.ia === undefined) delete process.env.THUMBNAIL_AI; else process.env.THUMBNAIL_AI = prev.ia;
  }
});

// 02/10/2026: el autor quiere «la misma miniatura, la de la Biblia con la mano, en
// la mayoría de los vídeos». Las principales se listan en coleccion/_principal.json
// y salen el FONDO_PRINCIPAL_PCT % de las veces (80 por defecto).
test('las principales salen casi siempre; las demás solo a veces', async () => {
  const r = await coleccion(['biblia1.png', 'biblia2.png', 'rio.png', 'campo.png']);
  fs.writeFileSync(path.join(r, 'coleccion', '_principal.json'), JSON.stringify(['biblia1.png', 'biblia2.png']));
  const conAzar = (v) => fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => v });
  for (let i = 0; i < 4; i++) assert.match((await conAzar(0.1)).nombre, /^biblia/, 'azar < 0.8 → principal');
  assert.match((await conAzar(0.95)).nombre, /^(rio|campo)\.png$/, 'azar >= 0.8 → una de las otras');
});

test('entre las principales también rota (no repite la misma seguida)', async () => {
  const r = await coleccion(['biblia1.png', 'biblia2.png', 'rio.png']);
  fs.writeFileSync(path.join(r, 'coleccion', '_principal.json'), JSON.stringify(['biblia1.png', 'biblia2.png']));
  const a = (await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => 0 })).nombre;
  const b = (await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => 0 })).nombre;
  assert.notEqual(a, b);
  assert.match(a + b, /biblia1.*biblia2|biblia2.*biblia1/);
});

test('sin _principal.json todo sigue como antes, y una lista rota no rompe nada', async () => {
  const r = await coleccion(['a.png', 'b.png']);
  assert.ok((await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => 0 })).nombre);
  fs.writeFileSync(path.join(r, 'coleccion', '_principal.json'), '{no es json');
  assert.ok((await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => 0 })).nombre);
  fs.writeFileSync(path.join(r, 'coleccion', '_principal.json'), JSON.stringify(['no-existe.png']));
  assert.ok((await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r, azar: () => 0 })).nombre);
});

// 02/10/2026: las imágenes del autor traen su logo (la cruz) arriba a la izquierda.
// Las de coleccion/_con_logo.json no se recortan (el logo se cortaría) y avisan
// con conLogo para que la miniatura no pinte un segundo logo encima.
test('fondos con logo: sin recorte (la esquina del logo se conserva) y conLogo=true', async () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'coleccion-'));
  fs.mkdirSync(path.join(r, 'coleccion'));
  // 1672x941 como las del autor; cuadrado blanco = el logo, arriba a la izquierda.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941"><rect width="1672" height="941" fill="#202020"/><rect x="40" y="35" width="130" height="130" fill="#ffffff"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(r, 'coleccion', 'mia.png'));
  fs.writeFileSync(path.join(r, 'coleccion', '_con_logo.json'), JSON.stringify(['mia.png']));
  for (let uso = 0; uso < 3; uso++) {   // en cada uso cambiaría el encuadre si se recortara
    const f = await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r });
    assert.equal(f.conLogo, true);
    const { data } = await sharp(f.ruta).extract({ left: 45, top: 40, width: 40, height: 40 }).raw().toBuffer({ resolveWithObject: true });
    const media = data.reduce((n, v) => n + v, 0) / data.length;
    assert.ok(media > 180, `uso ${uso}: el logo de la esquina se perdió (brillo ${media.toFixed(0)})`);
  }
});

test('fondos sin logo: conLogo=false', async () => {
  const r = await coleccion(['a.png']);
  assert.equal((await fondoColeccion({ cuando: MANANA, logger: silencio, raiz: r })).conLogo, false);
});
