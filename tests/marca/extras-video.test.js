// 03/10/2026: el autor pidió una opción en el panel para añadir a los vídeos el botón
// de suscribirse, el recordatorio de activar la campana y más. Ajuste
// `video_extras` (JSON) con tres elementos y cuándo sale cada uno.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizaExtras, planDeExtras, EXTRAS_POR_DEFECTO, DURACION } = require('../../utils/extras-video');
const { svgCampana, svgComentar, svgCompartir } = require('../../utils/extras-video-svg');

test('sin ajuste guardado: suscribirse al inicio, campana a la mitad, comentar al final', () => {
  assert.deepEqual(normalizaExtras(null), EXTRAS_POR_DEFECTO);
  assert.deepEqual(EXTRAS_POR_DEFECTO.suscribir.momentos, ['inicio']);
  assert.deepEqual(EXTRAS_POR_DEFECTO.campana.momentos, ['mitad']);
  assert.deepEqual(EXTRAS_POR_DEFECTO.comentar.momentos, ['final']);
});

test('compartir existe y viene apagado: se enciende desde el panel (03/10/2026)', () => {
  assert.deepEqual(EXTRAS_POR_DEFECTO.compartir, { activo: false, momentos: ['mitad'] });
  const e = normalizaExtras({ compartir: { activo: true, momentos: ['final'] } });
  assert.deepEqual(e.compartir, { activo: true, momentos: ['final'] });
  const plan = planDeExtras({ extras: e, duracion: 600 });
  assert.ok(plan.some(p => p.tipo === 'compartir'));
  assert.match(svgCompartir(2), /COMPARTE ESTA ORACIÓN/);
});

test('acepta el JSON guardado como texto y descarta lo que no conoce', () => {
  const e = normalizaExtras(JSON.stringify({
    suscribir: { activo: true, momentos: ['inicio', 'final', 'luego', 'final'] },
    campana: { activo: false, momentos: ['mitad'] },
    comentar: { activo: true, momentos: ['final'], texto: '  Escribe AMÉN si recibes esta oración  ' },
    otro: { activo: true }
  }));
  assert.deepEqual(e.suscribir, { activo: true, momentos: ['inicio', 'final'], shorts: true });
  assert.equal(e.campana.activo, false);
  assert.equal(e.comentar.texto, 'Escribe AMÉN si recibes esta oración');
  assert.equal(e.otro, undefined);
});

test('el texto de comentar se recorta y no admite marcas', () => {
  const e = normalizaExtras({ comentar: { activo: true, momentos: ['final'], texto: '<b>Hola</b> {\\an8} ' + 'x'.repeat(200) } });
  assert.ok(e.comentar.texto.length <= 60);
  assert.doesNotMatch(e.comentar.texto, /[<>{}\\]/);
  assert.equal(normalizaExtras({ comentar: { activo: true, momentos: ['final'], texto: '   ' } }).comentar.texto, EXTRAS_POR_DEFECTO.comentar.texto);
});

test('JSON roto: los valores por defecto, nunca un error que pare el render', () => {
  assert.deepEqual(normalizaExtras('{roto'), EXTRAS_POR_DEFECTO);
});

test('los momentos se calculan sobre la duración del cuerpo del vídeo', () => {
  const plan = planDeExtras({ extras: EXTRAS_POR_DEFECTO, duracion: 600 });
  assert.deepEqual(plan.map(p => [p.tipo, p.inicio]), [['suscribir', 3], ['campana', 300], ['comentar', 570]]);
});

test('si dos coinciden, se escalonan y ninguno se pisa', () => {
  const extras = normalizaExtras({ suscribir: { activo: true, momentos: ['mitad'] }, campana: { activo: true, momentos: ['mitad'] }, comentar: { activo: true, momentos: ['mitad'] } });
  const plan = planDeExtras({ extras, duracion: 600 });
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].inicio >= plan[i - 1].inicio + DURACION[plan[i - 1].tipo] + 1, JSON.stringify(plan));
});

test('nada se sale del vídeo; en uno muy corto se queda lo que cabe', () => {
  const plan = planDeExtras({ extras: EXTRAS_POR_DEFECTO, duracion: 20 });
  for (const p of plan) assert.ok(p.inicio >= 0 && p.inicio + DURACION[p.tipo] <= 20, JSON.stringify(p));
});

test('desactivado no sale', () => {
  const extras = normalizaExtras({ suscribir: { activo: false, momentos: ['inicio'] }, campana: { activo: false, momentos: ['mitad'] }, comentar: { activo: false, momentos: ['final'] } });
  assert.deepEqual(planDeExtras({ extras, duracion: 600 }), []);
});

test('las tarjetas son SVG del tamaño del vídeo y escapan el texto', () => {
  const c = svgCampana(1.5);
  assert.match(c, /^<svg[^>]+width="1920" height="1080"/);
  assert.match(c, /ACTIVA LA CAMPANA/);
  const m = svgComentar(2, 'Escribe "AMÉN" & comparte');
  assert.match(m, /&amp;/);
  assert.doesNotMatch(m, /& comparte/);
  assert.match(svgCampana(0), /opacity="0\.000"/);   // empieza invisible
});

// 03/10/2026: «ponlo en los Shorts también lo de suscribirse». En un Short solo
// va la animación de suscribirse (casilla propia, encendida por defecto), y
// «final» es a 6 s del final: un Short dura un minuto.
test('Shorts: solo suscribirse, con su casilla, y el final a 6 s del final', () => {
  assert.equal(EXTRAS_POR_DEFECTO.suscribir.shorts, true);
  const plan = planDeExtras({ extras: normalizaExtras({ suscribir: { activo: true, momentos: ['final'] } }), duracion: 58, formato: 'short' });
  assert.deepEqual(plan, [{ tipo: 'suscribir', inicio: 52 }]);
  const apagado = normalizaExtras({ suscribir: { activo: true, momentos: ['final'], shorts: false } });
  assert.deepEqual(planDeExtras({ extras: apagado, duracion: 58, formato: 'short' }), []);
});
