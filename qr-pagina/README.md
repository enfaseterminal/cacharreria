# Widget QR Página

Widget embebible que genera automáticamente un código QR de la URL de la página actual, permitiendo compartir fácilmente la página con dispositivos móviles.

## 📁 Archivos

- **`widget.html`** - Widget embebible completo (para usar con iframe)
- **`widget-script.js`** - Script embebible (para incluir directamente en tu página)
- **`standalone.html`** - Versión standalone completa (todo en un solo archivo)
- **`ejemplo-insercion.html`** - Ejemplos de cómo insertar el widget

## 🚀 Uso Rápido

### Opción 1: Usando iframe (Más fácil)

```html
<iframe 
    src="widget.html" 
    width="100%" 
    height="500" 
    frameborder="0"
    style="border: none; max-width: 400px; margin: 0 auto; display: block;">
</iframe>
```

### Opción 2: Script embebible (Recomendado)

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Mi Página</title>
</head>
<body>
    <h1>Mi Página Web</h1>
    
    <!-- Incluye la librería QRCode -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    
    <!-- Incluye el script del widget -->
    <script src="widget-script.js"></script>
    
    <!-- Añade el contenedor donde aparecerá el widget -->
    <div id="qr-pagina-widget-container"></div>
</body>
</html>
```

El widget se generará automáticamente al cargar la página.

### Opción 3: Versión Standalone

Simplemente abre `standalone.html` en tu navegador. Todo está incluido en un solo archivo.

## ⚙️ Personalización

Puedes personalizar el widget usando la función `QRPaginaWidget()`:

```html
<script>
    QRPaginaWidget({
        containerId: 'mi-contenedor',  // ID del contenedor
        qrSize: 300,                   // Tamaño del QR (píxeles)
        showUrl: true,                  // Mostrar la URL
        showDownload: true,             // Mostrar botón de descarga
        showCopy: true,                 // Mostrar botón de copiar
        autoGenerate: true              // Generar QR automáticamente
    });
</script>

<div id="mi-contenedor"></div>
```

## 📋 Características

- ✅ Genera automáticamente un código QR de la URL actual
- ✅ Descarga el QR como imagen PNG
- ✅ Copia la URL al portapapeles
- ✅ Interfaz responsive (se adapta a móviles)
- ✅ Diseño moderno y atractivo
- ✅ Fácil de insertar en cualquier página web
- ✅ Sin dependencias externas (excepto la librería QRCode)

## 🔧 Funcionalidades

### Generación automática
El widget detecta automáticamente la URL de la página actual y genera el código QR.

### Descarga de QR
Los usuarios pueden descargar el código QR como imagen PNG haciendo clic en el botón "Descargar QR".

### Copiar URL
Los usuarios pueden copiar la URL al portapapeles haciendo clic en el botón "Copiar URL".

### Regenerar QR
Si necesitas regenerar el QR con una URL diferente:

```javascript
const widget = QRPaginaWidget();
widget.regenerate('https://nueva-url.com');
```

## 📱 Compatibilidad

- ✅ Chrome/Edge (últimas versiones)
- ✅ Firefox (últimas versiones)
- ✅ Safari (últimas versiones)
- ✅ Navegadores móviles (iOS Safari, Chrome Mobile)

## 🎨 Personalización de Estilos

Si usas el script embebible, puedes personalizar los estilos sobrescribiendo las clases CSS:

- `.qr-pagina-widget-container` - Contenedor principal
- `.qr-pagina-widget-btn` - Botones
- `.qr-pagina-widget-qr` - Contenedor del QR

## 📝 Ejemplo Completo

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mi Página con Widget QR</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
    </style>
</head>
<body>
    <h1>Bienvenido a mi página</h1>
    <p>Esta es una página de ejemplo con el widget QR.</p>
    
    <!-- Widget QR -->
    <div id="qr-pagina-widget-container"></div>
    
    <!-- Librería QRCode -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    
    <!-- Script del widget -->
    <script src="widget-script.js"></script>
</body>
</html>
```

## 🔒 Seguridad

- El código QR se genera localmente en el navegador
- No se envía información a ningún servidor
- Los datos no se almacenan
- Puedes usar el widget sin conexión a internet (después de cargar la librería QRCode)

## 📄 Licencia

Este proyecto está bajo la licencia GNU GPLv3. Consulta el archivo [LICENSE](LICENSE).

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Siéntete libre de mejorar el código o reportar problemas.
