'use strict';

class ServiceRequestError extends Error {
  constructor(message, status = 502, code = 'UNAVAILABLE', providerStatus = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.providerStatus = providerStatus;
  }
}

// One deadline for headers and body. Doesn't retry writes or return the
// provider's URLs, credentials or raw messages to the browser.
async function requestJSON(url, { fetchImpl = fetch, timeoutMs = 5000, service = 'Conexión', ...options } = {}) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new ServiceRequestError(`${service}: did not respond in time. Check the connection again.`, 504, 'TIMEOUT'));
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
        throw new ServiceRequestError(`${service}: invalid response. Check the service address and access.`, 502, 'INVALID_RESPONSE');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ServiceRequestError(`${service}: invalid response.`, 502, 'INVALID_RESPONSE');
      }
      if (data.error) throw new ServiceRequestError(`${service}: the provider rejected the request. Check access and permissions.`, 502, 'UPSTREAM', response.status);
      return data;
    })()]);
  } catch (error) {
    controller.abort();
    if (error instanceof ServiceRequestError) throw error;
    throw new ServiceRequestError(`${service}: could not connect. Check the connection again.`);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { requestJSON, ServiceRequestError };
