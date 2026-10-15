'use strict';

class ServiceRequestError extends Error {
  constructor(message, status = 502, code = 'UNAVAILABLE', providerStatus = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

// Un plazo para cabeceras y cuerpo. No reintenta escrituras ni devuelve URLs,
// credenciales o mensajes crudos del proveedor al navegador.
async function requestJSON(url, { fetchImpl = fetch, timeoutMs = 5000, service = 'Conexión', ...options } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ServiceRequestError(`${service}: no respondió a tiempo. Vuelve a comprobar la conexión.`, 504, 'TIMEOUT'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetchImpl(url, {
        ...options, redirect: 'error', signal: controller.signal,
        headers: { accept: 'application/json', ...(options.headers || {}) }
      });
      if (!response.ok) {
        const status = [400, 404, 409, 422, 429].includes(response.status) ? response.status : 502;
        throw new ServiceRequestError(`${service}: solicitud rechazada (HTTP ${response.status}).`, status, 'UPSTREAM', response.status);
      }
      let data;
      try { data = await response.json(); } catch (_) {
        throw new ServiceRequestError(`${service}: respuesta no válida. Comprueba la dirección y el acceso del servicio.`, 502, 'INVALID_RESPONSE');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ServiceRequestError(`${service}: respuesta no válida.`, 502, 'INVALID_RESPONSE');
      }
      if (data.error) throw new ServiceRequestError(`${service}: el proveedor rechazó la consulta. Revisa el acceso y los permisos.`, 502, 'UPSTREAM', response.status);
      return data;
    })()]);
  } catch (error) {
    controller.abort();
    if (error instanceof ServiceRequestError) throw error;
    throw new ServiceRequestError(`${service}: no se pudo conectar. Vuelve a comprobar la conexión.`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { requestJSON, ServiceRequestError };
