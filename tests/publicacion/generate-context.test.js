const test = require('node:test');
const assert = require('node:assert/strict');
const { YouTubeAutomationAgent } = require('../../index');

test('POST /generate hands the validated context to the job and rejects invalid formats', async t => {
  const previousKey = process.env.API_KEY;
  process.env.API_KEY = 'local-test-only';
  t.after(() => {
    if (previousKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previousKey;
  });
  const agent = new YouTubeAutomationAgent();
  const received = [];
  agent.startGenerationJob = async input => { received.push(input); return { id: 'test-job' }; };
  agent.setupAPI();
  const server = await new Promise(resolve => {
    const listener = agent.app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = strategyContext => fetch(`http://127.0.0.1:${server.address().port}/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'local-test-only' },
    body: JSON.stringify({ topic: 'Oración para descansar', length: 'short', strategyContext })
  });
  const context = {
    format: 'short', franja: 'NOCHE', publishSlot: '2030-10-05T19:00:00-04:00',
    constraints: '  Una sola invitación hablada.  '
  };
  const response = await send(context);
  assert.equal(response.status, 202);
  assert.equal((await response.json()).success, true);
  assert.deepEqual(received[0].strategyContext, {
    format: 'short', franja: 'NOCHE', publishSlot: '2030-10-05T23:00:00.000Z',
    constraints: 'Una sola invitación hablada.'
  });
  assert.equal(received[0].source, 'manual');
  assert.equal((await send({ ...context, format: 'invalid' })).status, 400);
  assert.equal((await send({ ...context, franja: 'INVALID' })).status, 400);
  assert.equal((await send({ ...context, publishSlot: 'not-a-date' })).status, 400);
  assert.equal(received.length, 1, 'ningún dato inválido debe iniciar generación');
});
