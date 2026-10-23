# Control de Cargas Móvil

Versión de prueba v0.4. Aplicación PWA independiente para iPhone. Selecciona PDF desde Archivos/OneDrive; lee número de referencias del campo Total referencias prod. y peso; organiza cargas por peso, registra operario e inicio y final. Datos en el dispositivo; la clasificación de formatos y pasillos NO está validada. PDF.js se descarga desde CDN; se necesita conexión en la primera lectura.

Para publicar: Settings → Pages → Deploy from a branch → main → / (root) → Save.

## v0.5.26 — importación y resumen diario

- Los PDF idénticos (SHA-256), aunque cambien de nombre, se omiten. También se comparan originales de versiones anteriores.
- Un documento diferente con el mismo número de carga pide confirmación; conserva operario, estado, horarios, correcciones manuales y primera importación. Guarda las versiones del PDF localmente y un historial de importación en la copia JSON.
- Resumen por fecha de carga del PDF, con filtros por operario, ruta y matrícula. Los recuentos muestran todos los estados del ámbito elegido; las pestañas de estado filtran el listado. «Marcar visibles» respeta todos los filtros.
- Las cargas sin fecha se ven en «Todo el historial». La ruta puede introducirse en el detalle cuando no figura en el PDF.
- El lector PDF existente sigue necesitando su dependencia CDN; no se modifica la sincronización.

Validación: `node --test tests/daily-import.test.mjs`.
