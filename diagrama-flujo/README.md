# Arduino Flowchart

Aplicación web educativa para analizar sketches Arduino y generar diagramas de flujo SVG separados por función. El proyecto funciona en el navegador, conserva el código de trabajo y no necesita backend.

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

El código y la preferencia de tema se guardan en `localStorage`; **Guardar** descarga el código como archivo local.

## Uso de las fases 3 a 6

1. Escribe o abre un sketch `.ino`, `.cpp` o `.h`; el ejemplo Blink sigue disponible.
2. Pulsa **Generar diagrama**. Se analiza automáticamente el contenido actual si el análisis anterior no corresponde exactamente al código del editor.
3. Si hay errores sintácticos, consulta el diagnóstico y corrígelos antes de generar.
4. Usa el selector de función para alternar entre la inicialización global, `setup()`, `loop()` y las funciones auxiliares.
5. Activa o desactiva **Comentarios** para mostrar sus anotaciones sin modificar el código ni el AST. Usa la rueda, los botones de zoom, **Ajustar**, **Centrar** y arrastra el SVG para desplazarlo.
6. Si editas el código después de generar, el diagrama anterior se retira y se marca como desactualizado.
7. Selecciona un bloque para ver su tipo, líneas, código y comentarios. Los bloques con correspondencia directa desplazan y resaltan la línea de CodeMirror sin cambiar el cursor ni el contenido.
8. Coloca el cursor en una instrucción para resaltar el bloque correspondiente. Las decisiones se asocian a su condición; el editor no selecciona bloques sintéticos sin una referencia clara.
9. Usa `Tab` para entrar al diagrama, las flechas arriba/abajo para recorrer los bloques y `Enter` o `Espacio` para seleccionar. Con el área SVG enfocada, `+`/`-` hacen zoom, `F` ajusta y `0` centra.
10. Abre **Exportar** para descargar la función seleccionada como SVG, PNG o PDF. Cada formato añade al final una guía educativa con los símbolos realmente presentes en el diagrama, sus descripciones y una nota para consultar el código original. El menú permite incluir un fondo blanco y, opcionalmente, una cuadrícula. PNG se genera a 3× cuando el tamaño lo permite; el PDF es vectorial y crea páginas solapadas para diagramas grandes, colocando la guía en una página posterior cuando el diagrama necesita varias páginas. La exportación usa una copia aislada del SVG visible, conserva las anotaciones mostradas y no cambia el editor, la selección ni el diagrama.
11. Genera el diagrama y usa el panel **Simulador paso a paso** para iniciar la función seleccionada, avanzar o retroceder, ejecutar automáticamente, pausar o reiniciar. Puedes ajustar la velocidad automática y el límite de pasos (1–10.000).
12. Si aparece una solicitud de lectura de `digitalRead()` o `analogRead()`, introduce el valor simulado para continuar. Las variables desconocidas permiten definir un valor inicial; las condiciones desconocidas detienen la simulación sin elegir una rama arbitraria.
13. El bloque activo y la línea de código se resaltan sin mover el cursor. Los eventos Arduino se muestran en **Eventos simulados**; por ejemplo, `digitalWrite()` registra la petición de salida, `delay()` registra la espera y `Serial.println()` escribe en la consola simulada.

Los bloques muestran sus líneas de origen. Las decisiones distinguen las ramas **Sí/No**; los bucles tienen rutas de retorno; `setup()` se describe como inicialización de una sola ejecución y `loop()` muestra su repetición controlada por Arduino. Las llamadas desconocidas se conservan como bloques de llamada, no se ejecutan ni se tratan como errores por ser desconocidas. Si un bloque seleccionado queda fuera de la vista, el diagrama se centra en él manteniendo el nivel de zoom.

El simulador es didáctico: **no compila ni ejecuta C++ y no se conecta a una placa**. `setup()` se recorre una vez; `loop()` vuelve a empezar hasta pausar o alcanzar el límite. Un `delay()` nunca bloquea el navegador.

## Arquitectura

- `src/parser/lexer.js`, `src/parser/parser.js` y `src/parser/ast.js`: lexer, parser y AST con posiciones y comentarios conservados.
- `src/analyzer/analyzer.js`: coordinación del análisis y diagnósticos.
- `src/flowchart/flow-generator.js`: transforma nodos AST en bloques, conexiones y una estructura intermedia de flujo. Las funciones se mantienen separadas.
- `src/flowchart/flow-layout.js`: calcula dimensiones y posiciones para secuencias, ramas, bucles y casos; reserva carriles para las conexiones de retorno y despacho.
- `src/flowchart/svg-renderer.js`: crea las figuras, textos y rutas SVG con `createElementNS` y `textContent`. El código fuente no se interpreta como HTML o SVG.
- `src/export/export-manager.js`: construye un SVG independiente y autocontenido, rasteriza PNG con el navegador y exporta PDF vectorial dividido en páginas para contenido grande.
- `src/export/symbol-legend.js`: descubre las formas y conexiones existentes en el SVG de la función seleccionada y compone la leyenda educativa reutilizada por las exportaciones.
- `src/simulator/simulation-state.js`: estado reversible de pasos, variables, tareas, eventos y lecturas pendientes.
- `src/simulator/expression-evaluator.js`: evaluación segura y acotada de expresiones AST, sin `eval()` ni ejecución dinámica.
- `src/simulator/simulation-engine.js`: recorre el AST, resuelve ramas y bucles, llama funciones auxiliares y genera eventos Arduino simulados.
- `src/simulator/simulation-controller.js`: administra avance, retroceso, temporizador automático, pausa, reinicio e invalidación.
- `src/ui/simulator-panel.js`: controles accesibles, variables, estado actual, entradas de sensor y consola de eventos.
- `src/ui/diagram-selection.js`: resuelve posiciones del código contra bloques AST, mantiene el estado central de selección y presenta los detalles y comentarios asociados.
- `src/editor/code-editor.js`: expone navegación a líneas y un resaltado decorativo que no modifica el documento ni la selección/cursor.
- `src/main.js`: conecta el editor, análisis, generación, selector de función, estado de comentarios, selección sincronizada y controles de la vista.
- `src/styles/diagram.css`: estilos vectoriales adaptables a los temas claro y oscuro.
- `src/styles/simulator.css`: controles, panel de estado y resaltado de ejecución para ambos temas.
- `tests/diagram-selection.test.js` y `tests/code-editor.test.js`: correspondencia AST/bloque, selección centralizada, comentarios y resaltado de CodeMirror.
- `tests/flowchart.test.js`: pruebas estructurales del grafo, las conexiones y el layout.
- `tests/svg-renderer.test.js`: pruebas DOM del SVG, comentarios, referencias a líneas y seguridad mediante jsdom.
- `tests/export-manager.test.js`: contenido y dimensiones de SVG/PNG/PDF, símbolos reales de la guía, nombres seguros, PDF multipágina, errores, ausencia de solapamientos y limpieza de recursos.
- `tests/simulator.test.js`: avance/retroceso, reinicio, límites, bucles, saltos, funciones, sensores, eventos Arduino, automatización, invalidación y limpieza del resaltado en exportación.

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
