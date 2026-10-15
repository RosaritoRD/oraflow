const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, fallosNuevos, debeAvisar } = require('../../scripts/autodeploy/core');

const base = { head: 'a1', desplegado: 'a1', dirty: false, trabajosActivos: 0, discoLibreGB: 10 };

test('nada nuevo: no hace nada', () => {
  assert.equal(decide(base).accion, 'nada');
});
test('commit nuevo y todo en orden: despliega', () => {
  assert.equal(decide({ ...base, head: 'b2' }).accion, 'desplegar');
});
test('primera vuelta sin estado: adopta lo actual, no redespliega', () => {
  assert.equal(decide({ ...base, desplegado: null }).accion, 'adoptar');
});
test('cambios sin commitear: no despliega (la imagen los copiaría)', () => {
  assert.deepEqual(decide({ ...base, head: 'b2', dirty: true }), { accion: 'saltar', motivo: 'cambios-locales' });
});
test('un video o un short renderizándose: espera, no lo corta', () => {
  assert.deepEqual(decide({ ...base, head: 'b2', trabajosActivos: 1 }), { accion: 'esperar', motivo: 'trabajando' });
});
test('poco disco: no construye (el 01/10 un build llenó la VPS)', () => {
  assert.deepEqual(decide({ ...base, head: 'b2', discoLibreGB: 3.2 }), { accion: 'saltar', motivo: 'poco-disco' });
});

test('pruebas: solo bloquean los fallos NUEVOS', () => {
  const conocidos = ['Shorts Repurposing Studio', 'Research and Provenance Desk'];
  assert.deepEqual(fallosNuevos(['Shorts Repurposing Studio'], conocidos), []);
  assert.deepEqual(fallosNuevos(['Shorts Repurposing Studio', 'Accounts and Command Search'], conocidos), ['Accounts and Command Search']);
});

const M = 60000;
test('avisos: una vez por problema; cambios sin commitear solo tras 30 min', () => {
  assert.equal(debeAvisar({}, 'build-falla@b2', 0), true);
  assert.equal(debeAvisar({ ultimo: 'build-falla@b2', avisado: true }, 'build-falla@b2', 0), false);
  assert.equal(debeAvisar({ ultimo: 'cambios-locales@b2', desde: 0 }, 'cambios-locales@b2', 10 * M), false);
  assert.equal(debeAvisar({ ultimo: 'cambios-locales@b2', desde: 0 }, 'cambios-locales@b2', 31 * M), true);
  assert.equal(debeAvisar({}, null, 0), false);
});
