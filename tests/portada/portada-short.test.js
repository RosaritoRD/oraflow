// 02/10/2026 (el autor): portadas propias para los Shorts. Van como primer plano del
// vídeo (con el título encima) para que YouTube las use de portada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { eligePortada, componePortadaShort, aplicaPortada, segundosPortada } = require('../../utils/portada-short');

const silencio = { info() {}, warn() {} };

async function carpeta(nombres) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portadas-'));
  for (const [i, n] of nombres.entries()) {
    await sharp({ create: { width: 941, height: 1672, channels: 3, background: { r: 10 + i * 20, g: 20, b: 40 } } }).png().toFile(path.join(dir, n));
  }
  fs.writeFileSync(path.join(dir, 'LEEME.txt'), 'x');
  return dir;
}

test('sin carpeta o sin imágenes: null (el Short sale sin portada, nunca falla)', async () => {
  assert.equal(await eligePortada({ raiz: path.join(os.tmpdir(), 'no-existe-' + Date.now()), logger: silencio }), null);
  assert.equal(await eligePortada({ raiz: await carpeta([]), logger: silencio }), null);
});

test('rota: usa todas antes de repetir y no repite la misma seguida', async () => {
  const dir = await carpeta(['a.png', 'b.png', 'c.png']);
  const usadas = [];
  for (let i = 0; i < 5; i++) usadas.push(path.basename(await eligePortada({ raiz: dir, logger: silencio })));
  assert.deepEqual(new Set(usadas.slice(0, 3)), new Set(['a.png', 'b.png', 'c.png']));
  for (let i = 1; i < usadas.length; i++) assert.notEqual(usadas[i], usadas[i - 1]);
});

test('compone a 1080x1920 con el título y el logo arriba al centro', async () => {
  const dir = await carpeta(['a.png']);
  const logo = path.join(dir, 'logo.png');
  await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ffffff' } }).png().toFile(logo);
  const salida = path.join(dir, 'portada.jpg');
  await componePortadaShort({ sharp, fondo: path.join(dir, 'a.png'), logoPath: logo, titulo: 'Oración de la noche para descansar en Dios', salida });
  const meta = await sharp(salida).metadata();
  assert.equal(meta.width, 1080);
  assert.equal(meta.height, 1920);
  // El logo (blanco) va centrado arriba, donde lo traen las imágenes del autor.
  const { data } = await sharp(salida).extract({ left: 525, top: 125, width: 30, height: 30 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data.reduce((n, v) => n + v, 0) / data.length > 200, 'falta el logo arriba al centro');
});

test('los segundos de portada se ajustan y tienen tope', () => {
  // 11/10/2026: por defecto NO va dentro del vídeo (el Short empieza hablando).
  assert.equal(segundosPortada({}), 0);
  assert.equal(segundosPortada({ SHORT_COVER_SECONDS: '1.5' }), 1.5);
  assert.equal(segundosPortada({ SHORT_COVER_SECONDS: '2' }), 2);
  assert.equal(segundosPortada({ SHORT_COVER_SECONDS: '9' }), 3);
  assert.equal(segundosPortada({ SHORT_COVER_SECONDS: 'off' }), 0);
});

test('aplicaPortada: la portada tapa el principio y el vídeo dura lo mismo', async () => {
  const dir = await carpeta(['a.png']);
  const video = path.join(dir, 'v.mp4');
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1080x1920:d=4:r=30', '-pix_fmt', 'yuv420p', video]);
  const portada = path.join(dir, 'p.jpg');
  await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#ffffff' } }).jpeg().toFile(portada);
  await aplicaPortada({ video, portada, segundos: 1.5, logger: silencio });
  const dura = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
  assert.ok(Math.abs(dura - 4) < 0.15, `duración ${dura}`);
  const brillo = (t) => {
    const out = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    return out.reduce((n, v) => n + v, 0) / out.length;
  };
  assert.ok(brillo(0.2) > 200, 'al principio se ve la portada');
  assert.ok(brillo(3) < 30, 'después vuelve el vídeo');
});

test('el titular de la portada va sin emojis ni la cita entre paréntesis', () => {
  const { tituloDePortada } = require('../../utils/portada-short');
  assert.equal(tituloDePortada('Oración de la noche: en paz me acostaré (Salmo 4:8) 🙏'), 'Oración de la noche: en paz me acostaré');
  assert.equal(tituloDePortada('Oración de la mañana para comenzar con paz y esperanza ☀️🙏'), 'Oración de la mañana para comenzar con paz y esperanza');
  assert.equal(tituloDePortada('Oración de la noche para descansar en Dios | Salmo 4:8 🙏'), 'Oración de la noche para descansar en Dios | Salmo 4:8');
});
