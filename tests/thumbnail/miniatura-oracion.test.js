const test = require('node:test');
const assert = require('node:assert/strict');
const { titular, reparteTitular, etiquetaFormato, pasajeCorto, miniaturaSvg } = require('../../utils/miniatura-oracion');

test('titular sale del tema antes de "|", en mayúsculas', () => {
  assert.equal(titular({ topic: 'Cubre a mi familia hoy, Señor | Oración de protección' }), 'CUBRE A MI FAMILIA HOY, SEÑOR');
});

test('sin tema, usa el título quitando "Oración de la mañana:"', () => {
  assert.equal(titular({ title: 'Oración de la mañana: Dios te dará fuerzas para lo que viene' }), 'DIOS TE DARÁ FUERZAS PARA LO QUE VIENE');
});

test('reparte como la referencia: CUBRE A MI / FAMILIA HOY (oro) / SEÑOR', () => {
  const r = reparteTitular('CUBRE A MI FAMILIA HOY, SEÑOR');
  assert.deepEqual(r.lineas, ['CUBRE A MI', 'FAMILIA HOY', 'SEÑOR']);
  assert.equal(r.dorada, 1);
});

test('nunca más de 3 líneas: un titular largo se corta en la coma', () => {
  const r = reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO LARGO Y DIFÍCIL');
  assert.ok(r.lineas.length <= 3);
  for (const l of r.lineas) assert.ok(l.length <= 14, l);
});

test('etiqueta de formato según el tema', () => {
  assert.equal(etiquetaFormato('Antes de dormir, entrégale a Dios cada carga | Oración de la Noche'), 'ORACIÓN DE LA NOCHE');
  assert.equal(etiquetaFormato('Dios te dará fuerzas | Oración de la Mañana'), 'ORACIÓN DE LA MAÑANA');
});

test('pasaje corto: "Salmo 121:7-8" → "SALMO 121"', () => {
  assert.equal(pasajeCorto([{ reference: 'Salmo 121:7-8' }]), 'SALMO 121');
  assert.equal(pasajeCorto([]), null);
});

test('el SVG lleva logo, línea dorada, pasaje y etiqueta, y escapa el texto', () => {
  const svg = miniaturaSvg({
    lineas: ['CUBRE A MI', 'FAMILIA & HOY', 'SEÑOR'], dorada: 1,
    pasaje: 'SALMO 121', etiqueta: 'ORACIÓN DE LA MAÑANA', logo: 'data:image/png;base64,AAA'
  });
  assert.match(svg, /width="1280" height="720"/);
  assert.match(svg, /FAMILIA &amp; HOY/);
  assert.match(svg, /class="oro"/);
  // 03/10/2026: sin subrayado; el titular gigante condensado lo sustituye.
  assert.doesNotMatch(svg, /id="subrayado"/);
  assert.match(svg, /SALMO 121/);
  assert.match(svg, /ORACIÓN DE LA MAÑANA/);
  assert.match(svg, /<image href="data:image\/png;base64,AAA"/);
});

test('con coma y demasiado largo se queda la parte con contenido, no "SEÑOR"', () => {
  const r = reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO');
  assert.deepEqual(r.lineas, ['VE DELANTE DE', 'MÍ EN ESTE DÍA', 'DE TRABAJO']);
});

test('el tema largo de la IA no se corta a medias: se quita "Oración de la mañana para" y se corta en " y "', () => {
  const t = titular({ topic: 'Oración de la mañana para usar bien tus palabras y hablar con sabiduría' });
  assert.equal(t, 'USAR BIEN TUS PALABRAS Y HABLAR CON SABIDURÍA');
  assert.deepEqual(reparteTitular(t).lineas, ['USAR BIEN TUS', 'PALABRAS']);
});

test('"Oración corta de la noche para …" también pierde la cabecera', () => {
  assert.equal(titular({ topic: 'Oración corta de la noche para entregar tus preocupaciones a Dios' }), 'ENTREGAR TUS PREOCUPACIONES A DIOS');
});

// 27/09/2026: vídeo "ORACIÓN DE LA MAÑANA — DOMINGO 27…" salió con la miniatura
// "ENTREGAR TODO A DIOS ANTES DE DORMIR / ORACIÓN DE LA NOCHE": la franja y el
// titular salían del TEMA de la idea, y el título (que es lo que se publica) decía mañana.
const CASO_27 = {
  topic: 'Entregar todo a Dios antes de dormir',
  title: 'ORACIÓN DE LA MAÑANA — DOMINGO 27 DE SEPTIEMBRE — 1 PEDRO 5:7 | RECIBE PAZ AL ENTREGAR TUS CARGAS'
};

test('la franja la manda el TÍTULO, no el tema', () => {
  assert.equal(etiquetaFormato(CASO_27.topic, CASO_27.title), 'ORACIÓN DE LA MAÑANA');
});

test('si el tema contradice la franja del título, el titular sale del gancho del título', () => {
  const t = titular(CASO_27);
  assert.equal(t, 'RECIBE PAZ AL ENTREGAR TUS CARGAS');
  assert.doesNotMatch(t, /DORMIR/);
});

test('tema y título de la misma franja: el titular sigue saliendo del tema', () => {
  assert.equal(titular({ topic: 'Entregar todo a Dios antes de dormir', title: 'ORACIÓN DE LA NOCHE — X | Y' }),
    'ENTREGAR TODO A DIOS ANTES DE DORMIR');
  assert.equal(etiquetaFormato('Entregar todo a Dios antes de dormir', 'ORACIÓN DE LA NOCHE — X | Y'), 'ORACIÓN DE LA NOCHE');
});

test('título sin franja: se usa la del tema como antes', () => {
  assert.equal(etiquetaFormato('Paz antes de dormir', 'Paz | Salmo 4'), 'ORACIÓN DE LA NOCHE');
});

// 02/10/2026: "SOLTAR LA ANSIEDAD EN LAS MANOS DE DIOS" salía "…LAS MANOS DE" (sin
// DIOS): al no caber en 3 líneas se cortaba a ciegas. Ahora se quita la coletilla
// desde una preposición, y una línea nunca termina en "DE", "EN", "LA"…
test('si no cabe, quita la coletilla entera; nunca deja la frase colgando', () => {
  const r = reparteTitular('SOLTAR LA ANSIEDAD EN LAS MANOS DE DIOS');
  assert.ok(r.lineas.length <= 3);
  const ultima = r.lineas.at(-1).split(' ').at(-1);
  assert.ok(!['DE', 'EN', 'LA', 'LAS', 'EL', 'LOS', 'A', 'AL', 'DEL', 'CON', 'POR', 'PARA', 'Y', 'TU', 'MI', 'SU'].includes(ultima), r.lineas.join(' / '));
  assert.equal(r.lineas.join(' '), 'SOLTAR LA ANSIEDAD', 'corta en la primera preposición que deja frase completa');
});

test('lo que ya cabía sigue igual', () => {
  assert.deepEqual(reparteTitular('CUBRE A MI FAMILIA HOY, SEÑOR').lineas, ['CUBRE A MI', 'FAMILIA HOY', 'SEÑOR']);
});

test('con comas o «Y» se queda con el trozo con más contenido, no con una palabra suelta', () => {
  assert.equal(reparteTitular('SEÑOR, VE DELANTE DE MÍ EN ESTE DÍA DE TRABAJO LARGO Y DIFÍCIL').lineas.join(' '), 'VE DELANTE DE MÍ');
  assert.equal(reparteTitular('ENTREGAR A DIOS TODAS LAS PREOCUPACIONES DEL TRABAJO Y DE LA CASA').lineas.join(' '), 'ENTREGAR A DIOS TODAS LAS PREOCUPACIONES');
});

// 02/10/2026: al rehacer las miniaturas desde el TÍTULO publicado se colaban los
// emojis y «poderosa de» quedaba colgando delante del titular.
test('titular sin emojis ni la cita entre paréntesis', () => {
  assert.equal(titular({ title: 'Oración de la mañana para cuidar tus palabras ☀️🙏' }), 'CUIDAR TUS PALABRAS');
  assert.equal(titular({ title: 'Oración de la noche: en paz me acostaré (Salmo 4:8) 🙏' }), 'EN PAZ ME ACOSTARÉ');
});

test('«Oración poderosa de …» se va entera de la cabecera', () => {
  assert.equal(titular({ title: 'Oración poderosa de protección para tu familia 🙏' }), 'PROTECCIÓN PARA TU FAMILIA');
  assert.equal(titular({ title: 'Oración de protección para tu hogar' }), 'PROTECCIÓN PARA TU HOGAR');
});

// 03/10/2026: el título nuevo acaba en la cita («… | Salmo 27»). El gancho de la
// miniatura es la promesa del medio, nunca la cita.
test('con el título nuevo el gancho es la promesa, no «SALMO 27»', () => {
  const t = titular({ topic: 'Oración antes de dormir para soltar el miedo',
    title: 'ORACIÓN DE LA MAÑANA | EL SEÑOR ES MI LUZ: NO TEMAS LO QUE VENGA | Salmo 27' });
  assert.doesNotMatch(t, /SALMO/);
  assert.match(t, /EL SEÑOR ES MI LUZ/);
});
