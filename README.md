# Cacharrería

Colección de aplicaciones pequeñas, widgets, ejemplos y proyectos de código de EnFaseTerminal.

**Página principal:** [enfaseterminal.github.io/cacharreria/](https://enfaseterminal.github.io/cacharreria/)
**Repositorio:** [github.com/enfaseterminal/cacharreria](https://github.com/enfaseterminal/cacharreria)

La página principal enlaza a las aplicaciones publicadas. Las rutas de sus enlaces son relativas al repositorio, por lo que funcionan bajo `/cacharreria/` y no dependen de que un proyecto esté alojado en la raíz del dominio.

## Proyectos y recursos

### Arduino Flowchart

Editor educativo que analiza sketches Arduino, genera diagramas SVG por función y permite recorrerlos con un simulador paso a paso.

- **Aplicación:** [Abrir Arduino Flowchart](./diagrama-flujo/)
- **Guía del proyecto:** [`diagrama-flujo/README.md`](./diagrama-flujo/README.md)
- **Recursos principales:** `index.html`, `package.json`, `package-lock.json` y `vite.config.js`.
- **Código fuente:** `src/main.js`; `src/analyzer/analyzer.js`; `src/editor/code-editor.js`, `src/editor/editor-controls.js`; `src/examples/arduino-examples.js`, `src/examples/complete-arduino-example.js`; `src/export/export-manager.js`, `src/export/symbol-legend.js`; `src/flowchart/flow-generator.js`, `src/flowchart/flow-layout.js`, `src/flowchart/svg-renderer.js`; `src/parser/ast.js`, `src/parser/lexer.js`, `src/parser/parser.js`; `src/simulator/expression-evaluator.js`, `src/simulator/simulation-controller.js`, `src/simulator/simulation-engine.js`, `src/simulator/simulation-state.js`; `src/styles/diagram.css`, `src/styles/editor.css`, `src/styles/layout.css`, `src/styles/main.css`, `src/styles/simulator.css`; `src/ui/diagnostics-panel.js`, `src/ui/diagram-selection.js`, `src/ui/simulator-panel.js`, `src/ui/status-panel.js`, `src/ui/theme.js` y `src/ui/toolbar.js`.
- **Pruebas:** `tests/code-editor.test.js`, `tests/diagram-selection.test.js`, `tests/export-manager.test.js`, `tests/flowchart.test.js`, `tests/parser.test.js`, `tests/simulator.test.js` y `tests/svg-renderer.test.js`.
- **Desarrollo local:** desde `diagrama-flujo/`, ejecutar `npm ci`, `npm test` y `npm run build`.

### Alias en castellano

Hoja rápida de referencia de alias en español.

- **Aplicación:** [Abrir la hoja de referencia](./alias/alias-referencia-rapida.html)
- **Recurso:** `alias/alias-referencia-rapida.html`

### Generador de publicaciones sociales

Herramienta web para preparar publicaciones para redes sociales.

- **Aplicación:** [Abrir Social Poster Hub](./generar_social/)
- **Recursos:** `generar_social/index.html` y `generar_social/script.js`

### Guerra de barcos

Juego de Batalla Naval para MS-DOS, escrito en C.

- **Documentación:** [Leer instrucciones y estado del proyecto](./guerra_barcos_c/README.md)
- **Fuentes y ejecutable:** `ALEA.C`, `BARCOS.C`, `BARCOS.H`, `pchun.C` y `BARCOS.EXE`.
- El ejecutable está destinado a MS-DOS y puede probarse con DOSBox. La documentación detalla que faltan módulos necesarios para recompilarlo.

### Previsualizador de enlaces

Widget para mostrar previsualizaciones de enlaces al hacer clic o al pasar el cursor.

- **Aplicación:** [Abrir el previsualizador](./preview-enlace/)
- **Recursos:** `preview-enlace/index.html`, `preview-enlace/widget.html`, `preview-enlace/hover-preview.js`, `preview-enlace/ejemplo-hover.html`, `preview-enlace/ejemplo-completo.html`, `preview-enlace/ejemplo-insercion.html` y `preview-enlace/README.md`.

### Widget QR de página

Genera un código QR para compartir la URL de una página.

- **Versión independiente:** [Abrir el generador QR](./qr-pagina/standalone.html)
- **Widget para insertar:** [`widget.html`](./qr-pagina/widget.html) o [`widget-script.js`](./qr-pagina/widget-script.js)
- **Ejemplos y guía:** [`ejemplo-insercion.html`](./qr-pagina/ejemplo-insercion.html) y [`README.md`](./qr-pagina/README.md)

### Generador QR WiFi

Genera códigos QR para compartir redes WiFi con seguridad WPA, WEP o sin contraseña.

- **Versión independiente:** [Abrir el generador QR WiFi](./qr-wifi/standalone.html)
- **Versión con archivos separados:** [`index.html`](./qr-wifi/)
- **Widgets para insertar:** [`widget.html`](./qr-wifi/widget.html) y [`widget-embebible.html`](./qr-wifi/widget-embebible.html)
- **Ejemplos, estilos, lógica y guía:** `qr-wifi/ejemplo-insercion.html`, `qr-wifi/styles.css`, `qr-wifi/script.js` y `qr-wifi/README.md`.

### Validador del algoritmo de Luhn

Recurso interactivo que explica y valida números de ejemplo con el algoritmo de Luhn.

- **Aplicación:** [Abrir el validador](./validador-numero-tarjeta-credito/luhn_interactive_validator.html)
- **Recurso:** `validador-numero-tarjeta-credito/luhn_interactive_validator.html`

## Publicación

GitHub Pages sirve este repositorio en `https://enfaseterminal.github.io/cacharreria/`. El workflow [Deploy GitHub Pages](https://github.com/enfaseterminal/cacharreria/blob/main/.github/workflows/deploy-pages.yml) conserva las carpetas del sitio y publica la compilación de Vite en `diagrama-flujo/`.

Para que GitHub use ese artefacto, la fuente de publicación de Pages debe estar configurada como **GitHub Actions** en **Settings → Pages → Build and deployment → Source**.

## Licencia

Consulta [`LICENSE`](./LICENSE).
