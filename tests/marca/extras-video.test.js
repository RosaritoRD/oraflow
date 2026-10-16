// 03/10/2026: the owner asked for a panel option to add the subscribe button, the bell
// reminder and more to the videos. The `video_extras` setting (JSON) with three
// elements and when each one appears.
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizaExtras, planDeExtras, EXTRAS_POR_DEFECTO, DURACION } = require('../../utils/extras-video');
const { svgCampana, svgComentar, svgCompartir } = require('../../utils/extras-video-svg');

test('no saved setting: subscribe at the start, bell in the middle, comment at the end', () => {
  assert.deepEqual(normalizaExtras(null), EXTRAS_POR_DEFECTO);
  assert.deepEqual(EXTRAS_POR_DEFECTO.suscribir.momentos, ['inicio']);
  assert.deepEqual(EXTRAS_POR_DEFECTO.campana.momentos, ['mitad']);
  assert.deepEqual(EXTRAS_POR_DEFECTO.comentar.momentos, ['final']);
});

test('share exists and comes off: turned on from the panel (03/10/2026)', () => {
  assert.deepEqual(EXTRAS_POR_DEFECTO.compartir, { activo: false, momentos: ['mitad'] });
  const e = normalizaExtras({ compartir: { activo: true, momentos: ['final'] } });
  assert.deepEqual(e.compartir, { activo: true, momentos: ['final'] });
  const plan = planDeExtras({ extras: e, duracion: 600 });
  assert.ok(plan.some(p => p.tipo === 'compartir'));
  assert.match(svgCompartir(2), /COMPARTE ESTA ORACIÓN/);
});

test('accepts the JSON saved as text and drops what it doesn\'t know', () => {
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

test('the comment text is trimmed and doesn\'t accept markup', () => {
  const e = normalizaExtras({ comentar: { activo: true, momentos: ['final'], texto: '<b>Hola</b> {\\an8} ' + 'x'.repeat(200) } });
  assert.ok(e.comentar.texto.length <= 60);
  assert.doesNotMatch(e.comentar.texto, /[<>{}\\]/);
  assert.equal(normalizaExtras({ comentar: { activo: true, momentos: ['final'], texto: '   ' } }).comentar.texto, EXTRAS_POR_DEFECTO.comentar.texto);
});

test('broken JSON: the defaults, never an error that stops the render', () => {
  assert.deepEqual(normalizaExtras('{roto'), EXTRAS_POR_DEFECTO);
});

test('the moments are computed over the video body\'s duration', () => {
  const plan = planDeExtras({ extras: EXTRAS_POR_DEFECTO, duracion: 600 });
  assert.deepEqual(plan.map(p => [p.tipo, p.inicio]), [['suscribir', 3], ['campana', 300], ['comentar', 570]]);
});

test('if two coincide, they\'re staggered and none overlaps', () => {
  const extras = normalizaExtras({ suscribir: { activo: true, momentos: ['mitad'] }, campana: { activo: true, momentos: ['mitad'] }, comentar: { activo: true, momentos: ['mitad'] } });
  const plan = planDeExtras({ extras, duracion: 600 });
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i].inicio >= plan[i - 1].inicio + DURACION[plan[i - 1].tipo] + 1, JSON.stringify(plan));
});

test('nothing spills out of the video; in a very short one what fits stays', () => {
  const plan = planDeExtras({ extras: EXTRAS_POR_DEFECTO, duracion: 20 });
  for (const p of plan) assert.ok(p.inicio >= 0 && p.inicio + DURACION[p.tipo] <= 20, JSON.stringify(p));
});

test('disabled doesn\'t show', () => {
  const extras = normalizaExtras({ suscribir: { activo: false, momentos: ['inicio'] }, campana: { activo: false, momentos: ['mitad'] }, comentar: { activo: false, momentos: ['final'] } });
  assert.deepEqual(planDeExtras({ extras, duracion: 600 }), []);
});

test('the cards are video-sized SVGs and escape the text', () => {
  const c = svgCampana(1.5);
  assert.match(c, /^<svg[^>]+width="1920" height="1080"/);
  assert.match(c, /ACTIVA LA CAMPANA/);
  const m = svgComentar(2, 'Escribe "AMÉN" & comparte');
  assert.match(m, /&amp;/);
  assert.doesNotMatch(m, /& comparte/);
  assert.match(svgCampana(0), /opacity="0\.000"/);   // empieza invisible
});

// 03/10/2026: «put the subscribe thing on the Shorts too». A Short only gets the
// subscribe animation (its own checkbox, on by default), and «final» is 6 s before
// the end: a Short lasts a minute.
test('Shorts: only subscribe, with its checkbox, and the end 6 s before the end', () => {
  assert.equal(EXTRAS_POR_DEFECTO.suscribir.shorts, true);
  const plan = planDeExtras({ extras: normalizaExtras({ suscribir: { activo: true, momentos: ['final'] } }), duracion: 58, formato: 'short' });
  assert.deepEqual(plan, [{ tipo: 'suscribir', inicio: 52 }]);
  const apagado = normalizaExtras({ suscribir: { activo: true, momentos: ['final'], shorts: false } });
  assert.deepEqual(planDeExtras({ extras: apagado, duracion: 58, formato: 'short' }), []);
});
