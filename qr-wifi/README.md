# Generador QR WiFi

Generador de códigos QR para compartir credenciales WiFi de forma fácil y segura. Compatible con HTML5, CSS3 y JavaScript vanilla.

## 📁 Archivos

- **`standalone.html`** - Versión standalone completa (todo en un solo archivo)
- **`widget-embebible.html`** - Widget embebible para insertar en cualquier página
- **`index.html`** - Versión con archivos separados (requiere `styles.css` y `script.js`)
- **`styles.css`** - Estilos CSS
- **`script.js`** - Lógica JavaScript

## 🚀 Uso Rápido

### Opción 1: Versión Standalone (Recomendada)

Simplemente abre `standalone.html` en tu navegador. Todo está incluido en un solo archivo.

```html
<!-- Simplemente abre standalone.html -->
```

### Opción 2: Insertar como Widget en tu Página Web

#### Método A: Usando iframe (Más fácil)

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Mi Página Web</title>
</head>
<body>
    <h1>Mi Página</h1>
    
    <!-- Inserta el widget aquí -->
    <iframe 
        src="widget-embebible.html" 
        width="100%" 
        height="600" 
        frameborder="0"
        style="border: none; max-width: 500px; margin: 0 auto; display: block;">
    </iframe>
</body>
</html>
```

#### Método B: Copiar el código directamente

1. Abre `widget-embebible.html`
2. Copia el contenido de las etiquetas `<style>`, `<div id="qr-wifi-widget-embeddable">` y `<script>`
3. Pégalo en tu página HTML

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Mi Página Web</title>
    <!-- Pega aquí los estilos del widget -->
    <style>
        /* Estilos del widget */
    </style>
</head>
<body>
    <h1>Mi Página</h1>
    
    <!-- Pega aquí el HTML del widget -->
    <div id="qr-wifi-widget-embeddable">
        <!-- Contenido del widget -->
    </div>
    
    <!-- Incluye la librería QRCode -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    
    <!-- Pega aquí el JavaScript del widget -->
    <script>
        // Código JavaScript del widget
    </script>
</body>
</html>
```

## 📋 Características

- ✅ Genera códigos QR en formato estándar WiFi
- ✅ Soporta WPA, WEP y redes sin contraseña
- ✅ Descarga el QR como imagen PNG
- ✅ Copia el texto del código QR al portapapeles
- ✅ Interfaz responsive (se adapta a móviles)
- ✅ Diseño moderno y atractivo
- ✅ Fácil de insertar en cualquier página web

## 🔧 Formato del Código QR WiFi

El widget genera códigos QR siguiendo el estándar WiFi QR Code:

```
WIFI:T:WPA;S:NombreRed;P:Contraseña;H:false;
```

Donde:
- `T`: Tipo de seguridad (WPA, WEP, nopass)
- `S`: SSID (nombre de la red)
- `P`: Contraseña (opcional)
- `H`: Oculto (false = red visible)

## 📱 Compatibilidad

- ✅ Chrome/Edge (últimas versiones)
- ✅ Firefox (últimas versiones)
- ✅ Safari (últimas versiones)
- ✅ Navegadores móviles (iOS Safari, Chrome Mobile)

## 🎨 Personalización

Puedes personalizar los estilos del widget modificando las clases CSS:

- `.qr-wifi-widget-container` - Contenedor principal
- `.qr-wifi-widget-btn` - Botón de generar
- `.qr-wifi-widget-action-btn` - Botones de acción

## 📝 Ejemplo de Uso

1. Abre `standalone.html` en tu navegador
2. Ingresa el nombre de tu red WiFi (SSID)
3. Ingresa la contraseña (opcional)
4. Selecciona el tipo de seguridad
5. Haz clic en "Generar Código QR"
6. Descarga o comparte el código QR

## 🔒 Seguridad

- El código QR se genera localmente en el navegador
- No se envía información a ningún servidor
- Los datos no se almacenan
- Puedes usar el widget sin conexión a internet (después de cargar la librería QRCode)

## 📄 Licencia

Este proyecto es de código abierto y está disponible para uso libre.

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Siéntete libre de mejorar el código o reportar problemas.
