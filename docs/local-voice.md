# Local voice (Kokoro / Piper)

The `utils/local-tts-client.js` client generates narration in the local studio and
downloads the MP3. It doesn't call paid providers or use them as a fallback. The
tests use network-free fixtures: `node --test tests/voz/local-tts-client.test.js`.
They're also included in `npm test`.

Delivery validation: 16/16 dedicated tests, `FFMPEG_PATH=/usr/bin/ffmpeg
npm test` with 55/55 checks and exit 0, `npm run lint` and
`git diff --check` without errors. The studio screen was also checked with
a real Piper generation, playback and download; that doesn't yet enable
this client in the pipeline.

## Integration status

Client and adapter delivered on 2026-09-22. **Selecting it with
`TTS_PROVIDER=local` still needs the hook described below**:
`utils/ai-video-generator.js` had uncommitted changes when the client was
implemented, so that file wasn't modified and Oraflow wasn't restarted.
ElevenLabs and the other providers keep their current selection until the hook
is installed and `local` is chosen.

In `AIVideoGenerator.generateTTSAudio(text, outputPath)`, at the start of the method:

```js
if (process.env.TTS_PROVIDER === 'local') {
  return require('./local-tts-client').generateLocalTTSAudio(this, text, outputPath);
}
```

The adapter returns `outputPath` and keeps the shape of
`lastNarrationResult`, including `status`, `path`, `provider`, `model`,
`externalTaskId`, `generatedAt`, `simulated` and `cost`. It adds `metadata` with the
real API data. On failure it records `status: 'failed'` and propagates the error;
it never switches to ElevenLabs. It always clears `lastAlignment`, so the pipeline
uses its estimated timings without reusing timestamps from a previous narration.
The local provider's cost is `0`, with `invoiceRequired: false`.

## Configuration for whoever deploys it

After installing the hook, set in Oraflow:

```dotenv
TTS_PROVIDER=local
LOCAL_TTS_URL=http://voz-studio:8090
LOCAL_TTS_ENGINE=kokoro
LOCAL_TTS_SPEED=0.92
LOCAL_TTS_TIMEOUT_MS=1200000
# Optional: pick an ID from GET /api/voces. Without a value, the engine decides.
# LOCAL_TTS_VOICE=em_alex
```

`LOCAL_TTS_ENGINE` also accepts `piper`. Voices are looked up in the studio;
the client doesn't keep a duplicate catalog. Don't confuse the interface's ES/EN
language with the languages installed for synthesis.

The Oraflow container needs access to `voz_default`. Whoever owns the lab's
compose must add an external network with `name: voz_default` and add it
to the Oraflow service's networks **keeping its current networks**. No
public ports need to be opened and this internal call doesn't go through Google OAuth.
A manual `docker network connect` doesn't replace this durable compose
configuration. The lab's `.env` and compose weren't modified in this delivery.

## Behavior and limits

- `POST /api/generar`: sends `{texto, motor, voz, velocidad, formato: 'mp3'}`.
- Only downloads the returned `/api/audio/*.mp3` path, on the same
  server. It ignores `ruta`, which is a container path, and rejects redirects.
- Text of 1–40,000 characters; speed between 0.5 and 1.5. It doesn't rewrite the script:
  the engine handles its marks and pauses.
- 20-minute total timeout, configurable. No automatic retries: an
  interrupted request may still be running. Check the history before
  generating again.
- Streaming download, 128 MB max; checks the MP3 type and header. Writes
  to a temporary file and renames when done, keeping the previous file on
  transfer failures. The adapter also uses the pipeline's `isUsableAudioFile`
  to verify the audio can be decoded.
- The engine uses file names with one-second precision. The client doesn't
  send simultaneous requests by itself, but different consumers may
  overlap: the backend owner should consider unique IDs and serialization
  before enabling concurrent generation. The engine wasn't modified in this block.

Direct use for an internal check, without touching the pipeline:

```js
const { LocalTTSClient } = require('./utils/local-tts-client');
const result = await new LocalTTSClient().generate('Un nuevo día comienza.', '/tmp/local-voice.mp3');
console.log(result.metadata);
```
