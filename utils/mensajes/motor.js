// Open-source edition stub — see _no-incluido.js.
const { noIncluido } = require('./_no-incluido');

module.exports = {
  // Without rules, nothing is handled by the module: every comment goes to the regular flow.
  filtraAtendidos: async (_db, _cuenta, comentarios) => comentarios,
  ejecutaTodas: async () => ({}),
  recogeChats: async () => ({}),
  ejecutaCuenta: async () => ({}),
  ejecutaChat: async () => noIncluido(),
  ejecuciones: async () => noIncluido(),
  TOPE_PUBLICAS: 0, TOPE_DIARIO: 0, ESPERA_MS: 0
};
