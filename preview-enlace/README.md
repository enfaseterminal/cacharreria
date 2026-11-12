# Previsualizador de Enlaces

Widget embebible que muestra una previsualización de cualquier enlace. Disponible en dos modos:
- **Modal**: Previsualización al hacer clic (similar a las tarjetas de enlace de las redes sociales)
- **Hover**: Previsualización automática al pasar el ratón sobre el enlace ✨ **NUEVO**

## 📁 Archivos

- **`index.html`** - Versión standalone completa con ejemplos (modal)
- **`widget.html`** - Widget embebible para insertar en cualquier página (modal)
- **`hover-preview.js`** - Script para preview al hover (recomendado) ⭐
- **`ejemplo-hover.html`** - Ejemplo de uso con hover
- **`ejemplo-completo.html`** - Ejemplo completo con enlaces en un artículo

## 🚀 Uso Rápido

### ⭐ Opción 1: Preview al Hover (Recomendado)

La forma más elegante y moderna. Los enlaces muestran automáticamente la previsualización al pasar el ratón:

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Mi Página</title>
</head>
<body>
    <h1>Mi Página Web</h1>
    
    <!-- Enlaces con preview al hover -->
    <p>
        Visita <a href="https://www.ligaescolar.es/" class="preview-link">Liga Escolar</a> 
        para más información.
    </p>
    
    <!-- Incluye el script -->
    <script src="hover-preview.js"></script>
</body>
</html>
```

**Configuración personalizada:**
```html
<script src="hover-preview.js"></script>
<script>
    HoverPreview.init({
        selector: 'a.preview-link',  // Selector CSS
        applyToAllExternal: false,   // Aplicar a todos los enlaces externos
        delay: 500,                  // Delay antes de mostrar (ms)
        position: 'bottom',          // 'top', 'bottom', 'left', 'right'
        maxWidth: 400,               // Ancho máximo del preview
        cache: true,                 // Cachear previsualizaciones
        zIndex: 10000                // Z-index del tooltip
    });
</script>
```

### Opción 2: Versión Standalone (Modal)

Simplemente abre `index.html` en tu navegador. Incluye ejemplos de enlaces para probar.

### Opción 3: Insertar como Widget (iframe)

```html
<iframe 
    src="widget.html" 
    width="100%" 
    height="400" 
    frameborder="0"
    style="border: none; max-width: 500px; margin: 0 auto; display: block;">
</iframe>
```

## 📋 Características

### Preview al Hover
- ✅ **Preview automático al pasar el ratón** - Sin necesidad de hacer clic
- ✅ **Tooltip elegante y flotante** - Se posiciona automáticamente
- ✅ **Delay configurable** - Evita activaciones accidentales
- ✅ **Cache inteligente** - Mejora el rendimiento
- ✅ **Detección automática de nuevos enlaces** - Funciona con contenido dinámico

### Modal (versión clásica)
- ✅ Previsualización en modal al hacer clic
- ✅ Botones para abrir y copiar URL

### Funcionalidades Comunes
- ✅ Extrae título, descripción e imagen de la página
- ✅ Soporta Open Graph y Twitter Cards
- ✅ Diseño responsive y moderno
- ✅ Manejo de errores robusto

## 🔧 Funcionalidades

### Extracción de Metadatos

El widget extrae automáticamente:
- **Título**: De `<title>`, `og:title` o `twitter:title`
- **Descripción**: De `og:description`, `meta description` o `twitter:description`
- **Imagen**: De `og:image` o `twitter:image`

### Previsualización

Al ingresar una URL, el widget:
1. Valida la URL
2. Obtiene el contenido de la página (usando proxy CORS)
3. Extrae los metadatos
4. Muestra la previsualización en un modal

## 📱 Compatibilidad

- ✅ Chrome/Edge (últimas versiones)
- ✅ Firefox (últimas versiones)
- ✅ Safari (últimas versiones)
- ✅ Navegadores móviles

## 🎨 Personalización

Puedes personalizar los estilos del widget modificando las clases CSS:

- `.preview-widget-container` - Contenedor principal
- `.preview-widget-btn` - Botón de previsualizar
- `.preview-modal` - Modal de previsualización
- `.preview-title`, `.preview-description` - Elementos de la previsualización

## 📝 Ejemplos de Uso

### Ejemplo 1: Preview al Hover (Recomendado)

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Mi Blog</title>
</head>
<body>
    <article>
        <h1>Recursos Útiles</h1>
        <p>
            Visita <a href="https://www.ligaescolar.es/" class="preview-link">Liga Escolar</a> 
            para marcadores deportivos, o consulta 
            <a href="https://github.com/" class="preview-link">GitHub</a> 
            para proyectos de código.
        </p>
    </article>
    
    <script src="hover-preview.js"></script>
</body>
</html>
```

### Ejemplo 2: Aplicar a Todos los Enlaces Externos

```html
<script src="hover-preview.js"></script>
<script>
    HoverPreview.init({
        applyToAllExternal: true  // Aplica a todos los enlaces externos
    });
</script>
```

### Ejemplo 3: Widget Modal (iframe)

```html
<iframe 
    src="widget.html" 
    width="100%" 
    height="400" 
    frameborder="0"
    style="border: none; max-width: 500px; margin: 0 auto; display: block;">
</iframe>
```

### Ver Ejemplos Completos

- **`ejemplo-hover.html`** - Muestra el preview al hover en acción
- **`ejemplo-completo.html`** - Ejemplo completo con enlaces en un artículo

## 🔒 Limitaciones

Debido a las políticas CORS (Cross-Origin Resource Sharing), el widget utiliza un proxy CORS (`api.allorigins.win`) para obtener el contenido de las páginas. Esto significa:

- ✅ Funciona con la mayoría de sitios web
- ⚠️ Puede tener limitaciones de velocidad/rate limiting
- ⚠️ Algunos sitios pueden bloquear el acceso

### Alternativas

Para producción, puedes:
1. Usar una API de link preview (LinkPreview.io, Microlink.io)
2. Crear tu propio backend que haga el scraping
3. Usar un servicio de proxy CORS propio

## 🛠️ Cómo Funciona

1. El usuario ingresa una URL
2. El widget valida y normaliza la URL
3. Hace una petición al proxy CORS para obtener el HTML
4. Parsea el HTML y extrae metadatos (Open Graph, Twitter Cards, etc.)
5. Muestra la previsualización en un modal

## 📄 Licencia

Este proyecto está bajo la licencia GNU GPLv3. Consulta el archivo [LICENSE](LICENSE).

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Siéntete libre de mejorar el código o reportar problemas.
