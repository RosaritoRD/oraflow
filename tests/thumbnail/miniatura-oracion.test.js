const test = require('node:test');
const assert = require('node:assert/strict');
const { titular, reparteTitular, etiquetaFormato, pasajeCorto, miniaturaSvg } = require('../../utils/miniatura-oracion');

test('the headline comes from the topic before "|", in capitals', () => {
  assert.equal(titular({ topic: 'Cubre a mi familia hoy, Señor | Oración de protección' }), 'CUBRE A MI FAMILIA HOY, SEÑOR');
});

test('without a topic, uses the title minus "Oración de la mañana:"', () => {
  assert.equal(titular({ title: 'Oración de la mañana: Dios te dará fuerzas para lo que viene' }), 'DIOS TE DARÁ FUERZAS PARA LO QUE VIENE');
});

test('splits like the reference: CUBRE A MI / FAMILIA HOY (gold) / SEÑOR', () => {
  const r = reparteTitular('CUBRE A MI FAMILIA HOY, SEÑOR');
  assert.deepEqual(r.lineas, ['CUBRE A MI', 'FAMILIA HOY', 'SEÑOR']);
  assert.equal(r.dorada, 1);
});

test('never more than 3 lines: a long headline is cut at the comma', () => {
  const r = reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO LARGO Y DIFÍCIL');
  assert.ok(r.lineas.length <= 3);
  for (const l of r.lineas) assert.ok(l.length <= 14, l);
});

test('format label by topic', () => {
  assert.equal(etiquetaFormato('Antes de dormir, entrégale a Dios cada carga | Oración de la Noche'), 'ORACIÓN DE LA NOCHE');
  assert.equal(etiquetaFormato('Dios te dará fuerzas | Oración de la Mañana'), 'ORACIÓN DE LA MAÑANA');
});

test('pasaje corto: "Salmo 121:7-8" → "SALMO 121"', () => {
  assert.equal(pasajeCorto([{ reference: 'Salmo 121:7-8' }]), 'SALMO 121');
  assert.equal(pasajeCorto([]), null);
});

test('the SVG carries logo, gold line, passage and label, and escapes the text', () => {
  const svg = miniaturaSvg({
    lineas: ['CUBRE A MI', 'FAMILIA & HOY', 'SEÑOR'], dorada: 1,
    pasaje: 'SALMO 121', etiqueta: 'ORACIÓN DE LA MAÑANA', logo: 'data:image/png;base64,AAA'
  });
  assert.match(svg, /width="1280" height="720"/);
  assert.match(svg, /FAMILIA &amp; HOY/);
  assert.match(svg, /class="oro"/);
  // 03/10/2026: no underline; the giant condensed headline replaces it.
  assert.doesNotMatch(svg, /id="subrayado"/);
  assert.match(svg, /SALMO 121/);
  assert.match(svg, /ORACIÓN DE LA MAÑANA/);
  assert.match(svg, /<image href="data:image\/png;base64,AAA"/);
});

test('with a comma and too long, it keeps the part with content, not "SEÑOR"', () => {
  const r = reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO');
  assert.deepEqual(r.lineas, ['VE DELANTE DE', 'MÍ EN ESTE DÍA', 'DE TRABAJO']);
});

test('the AI\'s long topic isn\'t cut halfway: "Oración de la mañana para" is removed and it\'s cut at " y "', () => {
  const t = titular({ topic: 'Oración de la mañana para usar bien tus palabras y hablar con sabiduría' });
  assert.equal(t, 'USAR BIEN TUS PALABRAS Y HABLAR CON SABIDURÍA');
  assert.deepEqual(reparteTitular(t).lineas, ['USAR BIEN TUS', 'PALABRAS']);
});

test('"Oración corta de la noche para …" loses the header too', () => {
  assert.equal(titular({ topic: 'Oración corta de la noche para entregar tus preocupaciones a Dios' }), 'ENTREGAR TUS PREOCUPACIONES A DIOS');
});

// 27/09/2026: a video "ORACIÓN DE LA MAÑANA — DOMINGO 27…" went out with the thumbnail
// "ENTREGAR TODO A DIOS ANTES DE DORMIR / ORACIÓN DE LA NOCHE": the time-of-day band and the
// headline came from the idea's TOPIC, while the title (which is what gets published) said
// morning.
const CASO_27 = {
  topic: 'Entregar todo a Dios antes de dormir',
  title: 'ORACIÓN DE LA MAÑANA — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS'
};

test('the TITLE sets the time of day, not the topic', () => {
  assert.equal(etiquetaFormato(CASO_27.topic, CASO_27.title), 'ORACIÓN DE LA MAÑANA');
});

test('if the topic contradicts the title\'s time of day, the headline comes from the title\'s hook', () => {
  const t = titular(CASO_27);
  assert.equal(t, 'RECIBE PAZ AL ENTREGAR TUS CARGAS');
  assert.doesNotMatch(t, /DORMIR/);
});

test('topic and title with the same time of day: the headline still comes from the topic', () => {
  assert.equal(titular({ topic: 'Entregar todo a Dios antes de dormir', title: 'ORACIÓN DE LA NOCHE — X | Y' }),
    'ENTREGAR TODO A DIOS ANTES DE DORMIR');
  assert.equal(etiquetaFormato('Entregar todo a Dios antes de dormir', 'ORACIÓN DE LA NOCHE — X | Y'), 'ORACIÓN DE LA NOCHE');
});

test('title without a time of day: the topic\'s is used as before', () => {
  assert.equal(etiquetaFormato('Paz antes de dormir', 'Paz | Salmo 4'), 'ORACIÓN DE LA NOCHE');
});

// 02/10/2026: "SOLTAR LA ANSIEDAD EN LAS MANOS DE DIOS" came out as "…LAS MANOS DE"
// (no DIOS): when it didn't fit in 3 lines it was cut blindly. Now the tail is dropped
// from a preposition onward, and a line never ends in "DE", "EN", "LA"…
test('if it doesn\'t fit, the whole tail is removed; never leaves the phrase hanging', () => {
  const r = reparteTitular('SOLTAR LA ANSIEDAD EN LAS MANOS DE DIOS');
  assert.ok(r.lineas.length <= 3);
  const ultima = r.lineas.at(-1).split(' ').at(-1);
  assert.ok(!['DE', 'EN', 'LA', 'LAS', 'EL', 'LOS', 'A', 'AL', 'DEL', 'CON', 'POR', 'PARA', 'Y', 'TU', 'MI', 'SU'].includes(ultima), r.lineas.join(' / '));
  assert.equal(r.lineas.join(' '), 'SOLTAR LA ANSIEDAD', 'corta en la primera preposición que deja frase completa');
});

test('what already fit stays the same', () => {
  assert.deepEqual(reparteTitular('CUBRE A MI FAMILIA HOY, SEÑOR').lineas, ['CUBRE A MI', 'FAMILIA HOY', 'SEÑOR']);
});

test('with commas or «Y» it keeps the piece with the most content, not a loose word', () => {
  assert.equal(reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO LARGO Y DIFÍCIL').lineas.join(' '), 'VE DELANTE DE MÍ');
  assert.equal(reparteTitular('ENTREGAR A DIOS TODAS LAS PREOCUPACIONES DEL TRABAJO Y DE LA CASA').lineas.join(' '), 'ENTREGAR A DIOS TODAS LAS PREOCUPACIONES');
});

// 02/10/2026: when thumbnails were rebuilt from the published TITLE, emojis slipped
// in and «poderosa de» was left dangling in front of the headline.
test('headline without emojis or the reference in parentheses', () => {
  assert.equal(titular({ title: 'Oración de la mañana para cuidar tus palabras ☀️🙏' }), 'CUIDAR TUS PALABRAS');
  assert.equal(titular({ title: 'Oración de la noche: en paz me acostaré (Salmo 4:8) 🙏' }), 'EN PAZ ME ACOSTARÉ');
});

test('«Oración poderosa de …» is removed whole from the header', () => {
  assert.equal(titular({ title: 'Oración poderosa de protección para tu familia 🙏' }), 'PROTECCIÓN PARA TU FAMILIA');
  assert.equal(titular({ title: 'Oración de protección para tu hogar' }), 'PROTECCIÓN PARA TU HOGAR');
});

// 03/10/2026: the new title ends with the reference («… | Salmo 27»). The
// thumbnail's hook is the promise in the middle, never the reference.
test('with the new title the hook is the promise, not «SALMO 27»', () => {
  const t = titular({ topic: 'Oración antes de dormir para soltar el miedo',
    title: 'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ: NO TEMAS LO QUE VENGA | Salmo 27' });
  assert.doesNotMatch(t, /SALMO/);
  assert.match(t, /EL SEÑOR ES MI LUZ/);
});
