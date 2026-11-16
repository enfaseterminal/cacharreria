# Arduino Flowchart

Aplicación web educativa para analizar sketches Arduino y generar diagramas de flujo SVG separados por función. **Versión 0.9.1:** el laboratorio visual incorpora catálogo de componentes, cableado interactivo y posiciones persistentes, conectado al simulador reversible. El PDF se exporta como una hoja técnica con portada editable, diagrama y montaje independientes, código paginado, lista de componentes y conexiones seleccionables, y URL dinámica en todos los pies de página. El proyecto funciona en el navegador y no necesita backend.

## Requisitos

- Node.js 20.19+ o 22.12+.
- npm.

## Instalación y ejecución

Desde esta carpeta:

```bash
npm install
npm run dev
```

Vite muestra la dirección local en la terminal (normalmente `http://localhost:5173`). Para verificar la compilación de producción:

```bash
npm test
npm run build
npm run preview
```

El código y la preferencia de tema se guardan en `localStorage`; las etiquetas visuales se guardan aparte y solo se restauran si el código fuente coincide exactamente. **Guardar** descarga el código original como archivo local; las etiquetas no lo modifican ni se incluyen en el archivo Arduino.

## Uso de las fases 3 a 9

1. Escribe o abre un sketch `.ino`, `.cpp` o `.h`; el ejemplo Blink sigue disponible.
2. Pulsa **Generar diagrama**. Se analiza automáticamente el contenido actual si el análisis anterior no corresponde exactamente al código del editor.
3. Si hay errores sintácticos, consulta el diagnóstico y corrígelos antes de generar.
4. Usa el selector de función para alternar entre la inicialización global, `setup()`, `loop()` y las funciones auxiliares.
5. Activa o desactiva **Comentarios** para mostrar sus anotaciones sin modificar el código ni el AST. Usa la rueda, los botones de zoom, **Ajustar**, **Centrar** y arrastra el SVG para desplazarlo.
6. Si editas el código después de generar, el diagrama anterior se retira y se marca como desactualizado.
7. Selecciona un bloque para ver su tipo, líneas, código y comentarios. Los bloques con correspondencia directa desplazan y resaltan la línea de CodeMirror sin cambiar el cursor ni el contenido.
8. Cambia la **Etiqueta visual personalizada** en el panel de selección y pulsa **Aplicar etiqueta**. La etiqueta solo cambia la presentación del bloque y las exportaciones; el código, el AST y la simulación siguen usando el original. **Restablecer original** elimina la personalización. Un cambio exacto del código permite recuperar las etiquetas guardadas; si el código cambia, no se reasignan a nodos potencialmente distintos.
9. Coloca el cursor en una instrucción para resaltar el bloque correspondiente. Las decisiones se asocian a su condición; el editor no selecciona bloques sintéticos sin una referencia clara.
10. Usa `Tab` para entrar al diagrama, las flechas arriba/abajo para recorrer los bloques y `Enter` o `Espacio` para seleccionar. Con el área SVG enfocada, `+`/`-` hacen zoom, `F` ajusta y `0` centra.
11. Abre **Exportar** para descargar la función seleccionada como SVG, PNG o PDF. SVG y PNG conservan la guía educativa; el PNG añade un pie discreto con la URL pública. Antes del PDF puedes editar nombre, autor, fecha y descripción, y elegir sus secciones. El PDF vectorial presenta una portada, el diagrama y el montaje en páginas independientes, el código con saltos de página, y las tablas de componentes y conexiones. La URL pública normalizada aparece en cada página; el nombre del autor no se completa automáticamente. El montaje se obtiene del SVG renderizado del laboratorio, no de una reconstrucción aproximada. Los campos de portada no se guardan en el código del sketch.
12. Genera el diagrama y usa el panel **Simulador paso a paso** para iniciar la función seleccionada, avanzar o retroceder, ejecutar automáticamente, pausar o reiniciar. Puedes ajustar la velocidad automática y el límite de pasos (1–10.000).
13. En **Consola**, `Serial.begin()` configura la velocidad simulada; `Serial.print()` conserva el texto sin salto y `Serial.println()` termina la línea. La salida, los marcadores de inicio/fin y el registro cronológico se reconstruyen al avanzar y retroceder. Puedes copiar el texto y limpiar el historial visible. La pestaña **Pines** muestra modo, nivel lógico y última operación de cada pin usado; `INPUT_PULLUP` describe el modo configurado, pero no supone una lectura HIGH.
14. Si aparece una solicitud de lectura de `digitalRead()` o `analogRead()`, introduce el valor simulado para continuar. El monitor indica que una entrada digital está pendiente y desconocida hasta recibirlo. Las variables desconocidas permiten definir un valor inicial; las condiciones desconocidas detienen la simulación sin elegir una rama arbitraria.
15. El bloque activo y la línea de código se resaltan sin mover el cursor. `pinMode()`, `digitalWrite()`, `digitalRead()` y las instrucciones serie generan eventos solo cuando el motor alcanza y ejecuta la llamada.
16. Abre **Laboratorio** para añadir componentes y conectar terminales seleccionándolos en el dibujo o mediante los selectores. El LED solo refleja una salida conocida si su ánodo está conectado a un pin OUTPUT a través de una resistencia y su cátodo a GND. Un pulsador a GND produce HIGH al estar liberado con `INPUT_PULLUP` y LOW al pulsarlo; en modo `INPUT` una entrada abierta queda desconocida. El potenciómetro solo alimenta `analogRead()` cuando el wiper está conectado a A0–A5 y sus extremos a 5V y GND.
17. **Cargar ejemplo LED** prepara un montaje D13–resistencia de 220 Ω–LED–GND, carga el sketch de demostración y deja seleccionado `loop()`. El simulador ejecuta las funciones seleccionadas por separado; por eso el ejemplo también configura D13 en `loop()`. Avanza o retrocede para observar el estado reversible del LED.

Los bloques muestran sus líneas de origen. Las decisiones distinguen las ramas **Sí/No**; los bucles tienen rutas de retorno; `setup()` se describe como inicialización de una sola ejecución y `loop()` muestra su repetición controlada por Arduino. Las llamadas desconocidas se conservan como bloques de llamada, no se ejecutan ni se tratan como errores por ser desconocidas. Si un bloque seleccionado queda fuera de la vista, el diagrama se centra en él manteniendo el nivel de zoom.

El simulador es didáctico: **no compila ni ejecuta C++ y no se conecta a una placa**. La consola y el monitor no usan Web Serial ni representan estados eléctricos reales; las lecturas sin un componente conectado pueden introducirse manualmente y las que no se conocen no se inventan. El laboratorio solo valida rutas lógicas compatibles con los componentes incluidos; no calcula tensión, corriente, cortocircuitos ni tolerancias eléctricas. El montaje se guarda por separado del código y de las etiquetas en `localStorage`. `setup()` y `loop()` se recorren como sesiones independientes; `loop()` vuelve a empezar hasta pausar o alcanzar el límite. Un `delay()` nunca bloquea el navegador.

### Laboratorio de circuitos

- Usa **Añadir LED**, **Añadir resistencia**, **Añadir pulsador** o **Añadir potenciómetro**; selecciona un elemento para editar sus propiedades.
- Conecta terminales con los selectores **Desde/Hasta** o seleccionando dos terminales del dibujo. Las conexiones y componentes se guardan automáticamente; **Vaciar montaje** limpia solo el circuito.
- Arrastra los componentes con el ratón para cambiar su posición en la protoboard. Los terminales y cables se mueven con el componente, pero sus identificadores y conexiones lógicas no cambian. Las posiciones se guardan por separado y mover un componente no reinicia la simulación.
- Los componentes o conexiones desconocidos que ya estén guardados se conservan al migrar; se muestran como no compatibles y no se simulan hasta que exista una definición en el catálogo.
- Las resistencias ofrecen valores habituales, tolerancias y bandas de 3, 4 o 5 colores. La tolerancia y el valor son descriptivos: no se calcula corriente.
- El estado de la pulsación y el valor del mando del potenciómetro persisten como entradas virtuales. Durante la simulación, los cambios de entrada forman parte de los snapshots para que el retroceso los restaure.
- Si el navegador no puede leer el almacenamiento o encuentra un formato de circuito incompatible, muestra un aviso y permite iniciar un montaje vacío. El código y las etiquetas visuales usan claves de almacenamiento independientes.

## Arquitectura

- `src/parser/lexer.js`, `src/parser/parser.js` y `src/parser/ast.js`: lexer, parser y AST con posiciones y comentarios conservados.
- `src/analyzer/analyzer.js`: coordinación del análisis y diagnósticos.
- `src/flowchart/flow-generator.js`: transforma nodos AST en bloques, conexiones y una estructura intermedia de flujo. Las funciones se mantienen separadas.
- `src/flowchart/flow-layout.js`: calcula dimensiones y posiciones para secuencias, ramas, bucles y casos; reserva carriles para las conexiones de retorno y despacho.
- `src/flowchart/visual-labels.js`: persiste las etiquetas separadas del código y crea una copia de presentación del diagrama para renderizado.
- `src/flowchart/svg-renderer.js`: crea las figuras, textos y rutas SVG con `createElementNS` y `textContent`. El código fuente no se interpreta como HTML o SVG.
- `src/export/export-manager.js`: construye un SVG independiente y autocontenido, rasteriza PNG con el navegador y exporta PDF vectorial dividido en páginas para contenido grande.
- `src/export/symbol-legend.js`: descubre las formas y conexiones existentes en el SVG de la función seleccionada y compone la leyenda educativa reutilizada por las exportaciones.
- `src/simulator/simulation-state.js`: estado reversible de pasos, variables, tareas, eventos, salida serie, pines y lecturas pendientes.
- `src/simulator/expression-evaluator.js`: evaluación segura y acotada de expresiones AST, sin `eval()` ni ejecución dinámica.
- `src/simulator/simulation-engine.js`: recorre el AST, resuelve ramas y bucles, llama funciones auxiliares y genera eventos Arduino simulados.
- `src/simulator/simulation-controller.js`: administra avance, retroceso, temporizador automático, pausa, reinicio e invalidación.
- `src/ui/simulator-panel.js`: controles accesibles, variables, entradas de sensor, consola serie, registro de eventos y monitor de pines.
- `src/lab/circuit-catalog.js`: definiciones compartidas de componentes, propiedades admitidas, terminales y pines Arduino. Los anclajes de terminal son relativos; las coordenadas SVG pertenecen al renderizador.
- `src/lab/circuit-model.js`: conectividad lógica, propiedades, persistencia versionada, posiciones visuales separadas, resolución de entradas virtuales y estado derivado de LEDs. El formato persistido v2 guarda las posiciones en `visual.positions`; al cargar v1, extrae `component.position` y conserva IDs, propiedades y conexiones. Los getters de componentes mantienen una proyección `position` por compatibilidad.
- `src/lab/circuit-lab.js`: protoboard SVG accesible, Arduino Uno, controles de componentes, propiedades y conexiones. Calcula las coordenadas de terminales y cables desde el catálogo y el estado visual.
- `src/styles/laboratory.css`: presentación adaptable del laboratorio y sus componentes.
- `src/ui/diagram-selection.js`: resuelve posiciones del código contra bloques AST, mantiene el estado central de selección y presenta los detalles y comentarios asociados.
- `src/editor/code-editor.js`: expone navegación a líneas y un resaltado decorativo que no modifica el documento ni la selección/cursor.
- `src/main.js`: conecta el editor, análisis, generación, selector de función, estado de comentarios, selección sincronizada y controles de la vista.
- `src/styles/diagram.css`: estilos vectoriales adaptables a los temas claro y oscuro.
- `src/styles/simulator.css`: controles, panel de estado, consola, monitor de pines y resaltado de ejecución para ambos temas.
- `tests/diagram-selection.test.js`, `tests/visual-labels.test.js` y `tests/code-editor.test.js`: correspondencia AST/bloque, selección centralizada, etiquetas, comentarios y resaltado de CodeMirror.
- `tests/flowchart.test.js`: pruebas estructurales del grafo, las conexiones y el layout.
- `tests/svg-renderer.test.js`: pruebas DOM del SVG, comentarios, referencias a líneas y seguridad mediante jsdom.
- `tests/export-manager.test.js`: contenido y dimensiones de SVG/PNG/PDF, símbolos reales de la guía, nombres seguros, PDF multipágina, errores, ausencia de solapamientos y limpieza de recursos.
- `tests/simulator.test.js`, `tests/simulator-panel.test.js`, `tests/circuit-model.test.js`, `tests/circuit-lab.test.js` y `tests/lab-simulation.test.js`: simulador, consola, pines, catálogo, conexiones, persistencia, entradas virtuales, LED y restauración por snapshots.

La exportación PDF usa `jspdf` para crear el documento y `svg2pdf.js` para dibujar el SVG como vectores en el navegador. Ambas dependencias se cargan de forma diferida al solicitar PDF; no aumentan el código necesario al abrir la aplicación. SVG y PNG no requieren bibliotecas externas de exportación.

## Cobertura y límites

El generador representa secuencias, declaraciones, asignaciones, llamadas, `if/else` y `else if`, `for`, `while`, `do while`, `switch/case/default`, `break`, `continue` y `return`. Los comentarios asociados se dibujan como anotaciones; los comentarios sin asociación segura aparecen como notas independientes. Las declaraciones globales se muestran en una sección aparte de inicialización.

El parser y el simulador siguen siendo subconjuntos educativos de C/C++, no un compilador. El simulador soporta declaraciones y asignaciones simples, aritmética, comparaciones, operadores lógicos, incrementos/decrementos, `if/else`, `for`, `while`, `do while`, `switch`, `break`, `continue`, `return` y llamadas auxiliares con parámetros. Las funciones auxiliares se recorren como llamadas; sus valores de retorno no se usan como resultados de expresiones. Se simulan como eventos `pinMode`, `digitalWrite`, `analogWrite`, `digitalRead`, `analogRead`, `delay`, `Serial.print` y `Serial.println`; las lecturas piden un valor al usuario y no acceden a sensores reales. Los punteros, arrays, expresiones complejas, operaciones externas y construcciones desconocidas no se ejecutan. Si no puede determinarse una condición o el flujo de una construcción no soportada, la ejecución se detiene con una explicación; no inventa resultados.

El límite de pasos evita bucles interminables y la ejecución automática usa un temporizador para no bloquear la interfaz. El estado mantiene hasta 200 eventos recientes. Las simulaciones se descartan al cambiar el código, regenerar el diagrama o cambiar de función; el resaltado de simulación no se incluye en exportaciones. Los diagramas grandes mantienen un tamaño de texto legible y pueden requerir zoom o desplazamiento. Los PDF grandes se dividen en páginas con un pequeño solapamiento y se limitan a 1.000 páginas; la rasterización PNG depende de la memoria disponible. SVG conserva la calidad vectorial y es la opción recomendada para esos casos. PDF utiliza conversión vectorial en el navegador; tipografías o símbolos Unicode que no estén disponibles en fuentes estándar pueden variar.

## Fases anteriores

- Editor CodeMirror 6 con sintaxis C++, números de línea e indentación.
- Abrir archivos `.ino`, `.cpp` y `.h`; pegar desde el portapapeles; cargar el ejemplo Blink; limpiar o crear un proyecto.
- Guardar el código y restaurarlo desde `localStorage`; tema claro/oscuro.
- Diseño adaptable con pestañas móviles para cambiar entre editor y diagrama.
- Analizador con tokens, AST, comentarios y posiciones; panel plegable con funciones, variables, estructuras, AST y diagnósticos.
- Simulador didáctico basado en AST, sin ejecución de código real ni control de una placa Arduino.

## Licencia

Este proyecto está bajo la licencia GNU GPLv3. Consulta el archivo [LICENSE](LICENSE).
