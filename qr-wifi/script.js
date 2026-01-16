// Variables globales
let qrCode = null;
const form = document.querySelector('.wifi-form');
const ssidInput = document.getElementById('ssid');
const passwordInput = document.getElementById('password');
const securitySelect = document.getElementById('security');
const togglePasswordBtn = document.getElementById('togglePassword');
const qrOutput = document.getElementById('qrOutput');
const canvas = document.getElementById('qrCanvas');
const btnDownload = document.getElementById('btnDownload');
const btnCopy = document.getElementById('btnCopy');
const btnReset = document.getElementById('btnReset');
const infoSSID = document.getElementById('infoSSID');

// Toggle de mostrar/ocultar contraseña
togglePasswordBtn.addEventListener('click', function() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    this.textContent = type === 'password' ? 'Mostrar' : 'Ocultar';
});

// Generar código QR
form.addEventListener('submit', function(e) {
    e.preventDefault();
    generateQRCode();
});

function generateQRCode() {
    const ssid = ssidInput.value.trim();
    const password = passwordInput.value.trim();
    const security = securitySelect.value;

    if (!ssid) {
        alert('Por favor, ingresa el nombre de la red WiFi');
        return;
    }

    // Si no hay contraseña, cambiar el tipo de seguridad a "nopass"
    const finalSecurity = password ? security : 'nopass';

    // Construir la cadena de conexión WiFi según el formato estándar QR Code WiFi
    let wifiString = `WIFI:T:${finalSecurity};S:${escapeWiFiString(ssid)};`;
    
    if (password) {
        wifiString += `P:${escapeWiFiString(password)};`;
    }
    
    wifiString += ';H:false';

    // Limpiar el contenedor anterior si existe
    const qrContainer = canvas.parentNode;
    qrContainer.innerHTML = '<canvas id="qrCanvas"></canvas>';
    const newCanvas = document.getElementById('qrCanvas');

    // Generar el nuevo código QR
    qrCode = new QRCode(newCanvas, {
        text: wifiString,
        width: 300,
        height: 300,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Mostrar la salida
    qrOutput.style.display = 'block';
    infoSSID.textContent = ssid;

    // Scroll hacia el QR
    setTimeout(() => {
        qrOutput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
}

// Descargar el código QR como imagen
btnDownload.addEventListener('click', function() {
    const canvas = document.querySelector('#qrCanvas canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `wifi-qr-${ssidInput.value.replace(/\s+/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Copiar la cadena WiFi al portapapeles
btnCopy.addEventListener('click', function() {
    const ssid = ssidInput.value.trim();
    const password = passwordInput.value.trim();
    const security = securitySelect.value;
    const finalSecurity = password ? security : 'nopass';

    let wifiString = `WIFI:T:${finalSecurity};S:${escapeWiFiString(ssid)};`;
    if (password) {
        wifiString += `P:${escapeWiFiString(password)};`;
    }
    wifiString += ';H:false';

    navigator.clipboard.writeText(wifiString).then(() => {
        // Feedback visual
        const originalText = btnCopy.textContent;
        btnCopy.textContent = '✓ Copiado';
        setTimeout(() => {
            btnCopy.textContent = originalText;
        }, 2000);
    }).catch(() => {
        alert('No se pudo copiar al portapapeles');
    });
});

// Limpiar
btnReset.addEventListener('click', function() {
    form.reset();
    qrOutput.style.display = 'none';
    passwordInput.type = 'password';
    togglePasswordBtn.textContent = 'Mostrar';
    ssidInput.focus();
});

// Función para escapar caracteres especiales en WiFi QR
function escapeWiFiString(str) {
    return str
        .replace(/\\/g, '\\\\')  // Escapar backslash
        .replace(/;/g, '\\;')    // Escapar punto y coma
        .replace(/,/g, '\\,')    // Escapar coma
        .replace(/:/g, '\\:')    // Escapar dos puntos
        .replace(/"/g, '\\"');   // Escapar comillas
}

// Enfocar el input SSID al cargar
document.addEventListener('DOMContentLoaded', function() {
    ssidInput.focus();
});

// Permitir generar QR con Enter en el campo de contraseña
passwordInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        generateQRCode();
    }
});

// Exportar funciones para uso como widget embebible
window.QRWifiGenerator = {
    generateQRCode: generateQRCode,
    getWiFiString: function() {
        const ssid = ssidInput.value.trim();
        const password = passwordInput.value.trim();
        const security = securitySelect.value;
        const finalSecurity = password ? security : 'nopass';

        let wifiString = `WIFI:T:${finalSecurity};S:${escapeWiFiString(ssid)};`;
        if (password) {
            wifiString += `P:${escapeWiFiString(password)};`;
        }
        wifiString += ';H:false';
        
        return wifiString;
    }
};
