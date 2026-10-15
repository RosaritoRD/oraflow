# Conversión a suscriptores

El panel de Rendimiento separa Shorts y vídeos largos y muestra qué vídeos convierten visualizaciones en suscriptores. Un Short nativo se reconoce por `contentFormat: short`, aunque la publicación use `contentType: long_form` para identificar el flujo de producción.

## Lectura de los resultados

- **Shorts:** suscriptores ganados / visualizaciones interesadas × 1.000.
- **Vídeos largos:** suscriptores ganados / visualizaciones × 1.000.
- Cada fila muestra el primer y último día que YouTube devolvió realmente.
- Un cero medido se muestra como cero. Un informe sin datos conjuntos, simulado o sin denominador positivo queda pendiente.
- El grupo «Formato sin identificar» conserva los vídeos sin contexto suficiente.

Comparar piezas del mismo formato y con periodos similares antes de repetir un tema o cambiar un gancho. Una tasa alta con pocas visualizaciones tiene poca evidencia; esta tabla no declara ganadores ni activa experimentos automáticamente. Las métricas indican asociaciones y no prueban que un cambio editorial haya causado el resultado.

## Contrato de datos

`getOutcomeAnalytics` consulta `views,engagedViews,subscribersGained,subscribersLost` juntos, con dimensión y orden `day`. `subscriberConversion` valida las filas y guarda tanto el periodo solicitado como el realmente devuelto. Nunca divide suscriptores de una ventana entre visualizaciones públicas acumuladas ni entre métricas de otra consulta. Los ingresos siguen siendo una consulta independiente.

Los informes antiguos no se reinterpretan como mediciones de conversión. Se vuelven a medir con el flujo existente de analítica. Al reiniciar, el contexto de publicación recupera el formato y el informe almacenado sirve de respaldo. No se necesita una migración del esquema SQLite.

YouTube puede devolver datos solamente hasta el último día para el que estén disponibles todas las métricas solicitadas. El 3 de octubre de 2026 se verificó en el canal una consulta diaria del 29 de septiembre al 2 de octubre: devolvió datos hasta el 30 de septiembre, con 2.482 visualizaciones, 1.034 interesadas y 23 suscriptores ganados. Es una comprobación de la consulta, no un indicador actualizado permanentemente.

## Validación del cambio

- 7 pruebas nuevas cubren la consulta conjunta, el corte real, datos ausentes y ceros, denominadores por formato, exclusión de simulaciones, Shorts nativos y recarga del historial.
- 34 pruebas de conversión y fiabilidad de analítica superadas.
- Suite completa `node test.js`: 59/59 superadas.
- Navegador: español e inglés a 390 y 1.440 píxeles; sin errores JavaScript ni desbordamiento de página; títulos escapados y ceros/pending diferenciados.

El 4 de octubre se amplió la comprobación móvil: el contenedor de la tabla debe caber en la pantalla y permitir desplazamiento horizontal hasta la última columna. Se reprodujo un recorte a 390 píxeles causado por el tamaño mínimo automático del hijo de una cuadrícula; `min-width: 0` en `#subscriber-growth` deja el desplazamiento dentro de la tabla. La verificación espera el final de la animación de entrada del documento para medir su tamaño estable.

## Primera actualización del histórico

El 4 de octubre de 2026, a las 04:59 UTC, se actualizaron correctamente 19 vídeos mediante el flujo existente de analítica, conservando la ventana preferida de cada vídeo. Se obtuvieron 17 mediciones de conversión: 5 Shorts y 12 vídeos largos. Quedaron 2 vídeos pendientes de datos de YouTube. Se actualizan los informes internos y las instantáneas de aprendizaje, sin publicar vídeos ni modificar sus títulos.

## Fuentes oficiales verificadas el 3 de octubre de 2026

- [YouTube: recuento de visualizaciones de Shorts y visualizaciones interesadas](https://support.google.com/youtube/answer/10059070?hl=es).
- [YouTube Analytics: disponibilidad temporal de las métricas](https://developers.google.com/youtube/analytics/reference/reports/query).
- [YouTube Analytics: informes de canal y métricas admitidas](https://developers.google.com/youtube/analytics/channel_reports).
