// 02/10/2026: marca en los vídeos largos (OK del autor): intro dorada de 8 s, nombre del
// canal arriba-dcha, logo abajo-dcha y la animación «me gusta · suscríbete · campana».
const test = require('node:test');
const assert = require('node:assert');
const { saludoDe, marcaActiva, lineasIntro, filtroCuerpo, claveIntro, concatCuadra, escapaTexto, assNombre, assIntro, assHora } = require('../../utils/marca-video');

test('el saludo de la intro sigue la franja del contenido', () => {
  assert.strictEqual(saludoDe('manana'), 'BUENOS DÍAS');
  assert.strictEqual(saludoDe('tarde'), 'BUENAS TARDES');
  assert.strictEqual(saludoDe('noche'), 'BUENAS NOCHES');
  assert.strictEqual(saludoDe('rara'), 'BUENOS DÍAS');
});

test('activa por defecto; BRAND_VIDEO=0 la apaga', () => {
  assert.strictEqual(marcaActiva({}), true);
  assert.strictEqual(marcaActiva({ BRAND_VIDEO: '0' }), false);
});

test('las tarjetas de la intro: saludo y el nombre del canal en dos líneas', () => {
  assert.deepStrictEqual(lineasIntro('noche', {}), ['BUENAS NOCHES', 'ORACIONES EN PRESENCIA', 'DE JESHUA']);
  assert.deepStrictEqual(lineasIntro('manana', { BRAND_INTRO_LINES: 'Uno|Dos' }), ['BUENOS DÍAS', 'UNO', 'DOS']);
});

test('el filtro del cuerpo quema subtítulos, nombre (libass), logo y la animación a su hora', () => {
  const f = filtroCuerpo({ assPath: '/x/c.ass', nombreAss: '/m/nombre.ass', fontsDir: '/f', inicioSuscribir: 3, width: 1920 });
  assert.match(f, /^\[0:v\]subtitles='\/x\/c\.ass',subtitles='\/m\/nombre\.ass':fontsdir='\/f'\[mb\]/);
  assert.doesNotMatch(f, /drawtext/);   // el ffmpeg del contenedor no lo trae
  assert.match(f, /\[1:v\]scale=130:130/);
  assert.match(f, /\[2:v\]setpts=PTS-STARTPTS\+3\/TB/);
  assert.match(f, /overlay=eof_action=pass/);
  assert.match(f, /\[vout\]$/);
});

test('sin subtítulos el filtro sigue siendo válido', () => {
  const f = filtroCuerpo({ assPath: null, nombreAss: '/m/n.ass', fontsDir: '/f', inicioSuscribir: 3, width: 1920 });
  assert.match(f, /^\[0:v\]subtitles='\/m\/n\.ass'/);
});

test('el ASS del nombre va arriba a la derecha todo el vídeo', () => {
  const a = assNombre({ nombre: 'MI {CANAL}' });
  assert.match(a, /Style: Nombre,Bebas Neue,58,/);
  assert.match(a, /,9,0,40,26,1$/m);   // alineación 9 = arriba-dcha
  assert.match(a, /Dialogue: 0,0:00:00\.00,9:59:59\.00,Nombre,,0,0,0,,MI CANAL$/m);
});

test('el ASS de la intro tiene las tres tarjetas con fundido', () => {
  const a = assIntro({ lineas: ['BUENAS NOCHES', 'ORACIONES EN PRESENCIA', 'DE JESHUA'] });
  assert.strictEqual((a.match(/^Dialogue:/gm) || []).length, 3);
  assert.match(a, /0:00:00\.30,0:00:02\.90,T0,,0,0,0,,\{\\fad\(700,600\)\}BUENAS NOCHES/);
  assert.match(a, /Style: T1,Cinzel,112,/);
  assert.match(a, /Style: T2,Cinzel,175,/);
  assert.strictEqual(assHora(65.5), '0:01:05.50');
});

test('el texto se escapa para drawtext', () => {
  assert.strictEqual(escapaTexto("A:B'C"), "A\\:B’C");
});

test('la intro se guarda por versión, tamaño, fps y saludo', () => {
  assert.strictEqual(claveIntro({ width: 1920, height: 1080, fps: 30, momento: 'noche' }), 'intro-v2-1920x1080-30-noche');
});

test('la unión cuadra si dura intro + cuerpo (±0,3 s)', () => {
  assert.strictEqual(concatCuadra(8, 400, 408.1), true);
  assert.strictEqual(concatCuadra(8, 400, 400), false);
});

// 03/10/2026: «Elementos del vídeo» — varias animaciones (suscribirse, campana,
// comentar), cada una con su entrada y su hora, encadenadas en la misma pasada.
test('el filtro encadena varias animaciones, cada una a su hora', () => {
  const f = filtroCuerpo({ assPath: null, nombreAss: '/m/n.ass', fontsDir: '/f', width: 1920,
    animaciones: [{ inicio: 3 }, { inicio: 300 }, { inicio: 570.5 }] });
  assert.match(f, /\[2:v\]setpts=PTS-STARTPTS\+3\/TB\[a0\]/);
  assert.match(f, /\[3:v\]setpts=PTS-STARTPTS\+300\/TB\[a1\]/);
  assert.match(f, /\[4:v\]setpts=PTS-STARTPTS\+570\.5\/TB\[a2\]/);
  assert.equal((f.match(/overlay=eof_action=pass/g) || []).length, 3);
  assert.match(f, /\[vout\]$/);
});

test('sin animaciones: solo nombre y logo', () => {
  const f = filtroCuerpo({ assPath: null, nombreAss: '/m/n.ass', fontsDir: '/f', width: 1920, animaciones: [] });
  assert.doesNotMatch(f, /\[2:v\]/);
  assert.match(f, /\[mc\]format=yuv420p\[vout\]$/);
});

// 03/10/2026: suscribirse también en los Shorts (vertical 1080x1920).
test('Short: recorta los botones de la animación, los amplía y los pone arriba', () => {
  const { filtroShort } = require('../../utils/marca-video');
  const f = filtroShort({ assPath: '/x/c.ass', animaciones: [{ inicio: 52 }], width: 1080, height: 1920 });
  assert.match(f, /^\[0:v\]subtitles='\/x\/c\.ass'\[mb\]/);
  assert.match(f, /\[1:v\]crop=720:200:640:210,scale=918:-1,setpts=PTS-STARTPTS\+52\/TB\[a0\]/);
  assert.match(f, /\[mb\]\[a0\]overlay=\(W-w\)\/2:326:eof_action=pass,format=yuv420p\[vout\]$/);
  const sinSubs = filtroShort({ assPath: null, animaciones: [{ inicio: 10 }], width: 1080, height: 1920 });
  assert.match(sinSubs, /^\[0:v\]null\[mb\]/);
});
