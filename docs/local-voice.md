# Voz local (Kokoro / Piper)

El cliente `utils/local-tts-client.js` genera narración en el estudio local y
descarga el MP3. No llama a proveedores de pago ni los usa como respaldo. Los
tests usan fixtures sin red: `node --test tests/voz/local-tts-client.test.js`.
También están incluidos en `npm test`.

Validación de la entrega: 16/16 pruebas dedicadas, `FFMPEG_PATH=/usr/bin/ffmpeg
npm test` con 55/55 comprobaciones y salida 0, `npm run lint` y
`git diff --check` sin errores. La pantalla del estudio se comprobó también con
una generación real de Piper, reproducción y descarga; eso no activa todavía
este cliente en el pipeline.

## Estado de la integración

Cliente y adaptador entregados por Codex el 2026-09-22. **La selección mediante
`TTS_PROVIDER=local` todavía requiere el enganche de Claude descrito abajo**:
`utils/ai-video-generator.js` pertenece a Claude y tenía cambios sin commit
cuando se implementó el cliente. No se ha modificado ese archivo ni se ha
reiniciado Oraflow. ElevenLabs y los demás proveedores conservan su selección
actual hasta instalar el enganche y elegir `local`.

En `AIVideoGenerator.generateTTSAudio(text, outputPath)`, al principio del método:

```js
if (process.env.TTS_PROVIDER === 'local') {
  return require('./local-tts-client').generateLocalTTSAudio(this, text, outputPath);
}
```

El adaptador devuelve `outputPath` y mantiene la estructura de
`lastNarrationResult`, incluidos `status`, `path`, `provider`, `model`,
`externalTaskId`, `generatedAt`, `simulated` y `cost`. Añade `metadata` con los
datos reales de la API. En fallo registra `status: 'failed'` y propaga el error;
nunca cambia a ElevenLabs. Siempre limpia `lastAlignment`, para que el pipeline
use sus tiempos estimados sin reutilizar timestamps de una narración anterior.
El coste del proveedor local es `0`, con `invoiceRequired: false`.

## Configuración para el responsable del despliegue

Después de instalar el enganche, configurar en Oraflow:

```dotenv
TTS_PROVIDER=local
LOCAL_TTS_URL=http://voz-studio:8090
LOCAL_TTS_ENGINE=kokoro
LOCAL_TTS_SPEED=0.92
LOCAL_TTS_TIMEOUT_MS=1200000
# Opcional: elegir un ID de GET /api/voces. Sin valor, decide el motor.
# LOCAL_TTS_VOICE=em_alex
```

`LOCAL_TTS_ENGINE` también admite `piper`. Las voces se consultan en el estudio;
el cliente no mantiene un catálogo duplicado. No confundir el idioma ES/EN de la
interfaz con los idiomas instalados para síntesis.

El contenedor Oraflow necesita acceso a `voz_default`. El responsable del
compose del lab debe añadir una red externa con `name: voz_default` y añadirla
a las redes del servicio Oraflow **conservando sus redes actuales**. No hay
que abrir puertos públicos ni pasar por Google OAuth para esta llamada interna.
Una conexión manual con `docker network connect` no sustituye esta configuración
duradera del compose. `.env` y compose del lab no se modificaron en esta entrega.

## Comportamiento y límites

- `POST /api/generar`: envía `{texto, motor, voz, velocidad, formato: 'mp3'}`.
- Descarga exclusivamente la ruta `/api/audio/*.mp3` devuelta, en el mismo
  servidor. Ignora `ruta`, que es una ruta del contenedor, y rechaza redirects.
- Texto de 1–40.000 caracteres; velocidad entre 0,5 y 1,5. No reescribe el guion:
  el motor se encarga de sus marcas y pausas.
- Timeout total de 20 minutos, configurable. Sin reintentos automáticos: una
  petición interrumpida puede seguir ejecutándose. Revisar el historial antes
  de volver a generar.
- Descarga en streaming, máximo 128 MB; comprueba tipo y cabecera MP3. Escribe
  en un temporal y renombra al terminar, conservando el archivo previo ante
  fallos de transferencia. El adaptador además usa `isUsableAudioFile` del
  pipeline para verificar que el audio puede decodificarse.
- El motor usa nombres de archivo con precisión de un segundo. El cliente no
  envía peticiones simultáneas por sí mismo, pero distintos consumidores pueden
  coincidir: el responsable del backend debe valorar IDs únicos y serialización
  antes de activar generación concurrente. No se modificó el motor en este bloque.

Uso directo para una comprobación interna, sin tocar el pipeline:

```js
const { LocalTTSClient } = require('./utils/local-tts-client');
const result = await new LocalTTSClient().generate('Un nuevo día comienza.', '/tmp/local-voice.mp3');
console.log(result.metadata);
```
