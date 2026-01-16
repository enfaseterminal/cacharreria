/**
 * Widget QR Página - Script embebible
 * Genera un código QR de la URL de la página actual
 * 
 * Uso:
 * 1. Incluye la librería QRCode: <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
 * 2. Incluye este script: <script src="widget-script.js"></script>
 * 3. Añade un contenedor: <div id="qr-pagina-widget-container"></div>
 */

(function() {
    'use strict';

    // Configuración por defecto
    const defaultConfig = {
        containerId: 'qr-pagina-widget-container',
        qrSize: 250,
        showUrl: true,
        showDownload: true,
        showCopy: true,
        autoGenerate: true
    };

    // Función principal para inicializar el widget
    function initQRWidget(config = {}) {
        const options = Object.assign({}, defaultConfig, config);
        const container = document.getElementById(options.containerId);
        
        if (!container) {
            console.error('No se encontró el contenedor con ID: ' + options.containerId);
            return;
        }

        // Verificar que QRCode esté disponible
        if (typeof QRCode === 'undefined') {
            console.error('La librería QRCode no está cargada. Incluye: <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>');
            container.innerHTML = '<p style="color: red;">Error: La librería QRCode no está cargada.</p>';
            return;
        }

        // Obtener la URL actual
        const currentUrl = window.location.href;

        // Crear el HTML del widget
        container.innerHTML = `
            <style>
                .qr-pagina-widget {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    max-width: 400px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .qr-pagina-widget * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                .qr-pagina-widget-container {
                    background: white;
                    border-radius: 10px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                    padding: 25px;
                    text-align: center;
                }
                .qr-pagina-widget-container h3 {
                    color: #333;
                    font-size: 18px;
                    margin-bottom: 15px;
                }
                .qr-pagina-widget-container .subtitle {
                    color: #666;
                    font-size: 12px;
                    margin-bottom: 20px;
                }
                .qr-pagina-widget-qr {
                    margin: 20px 0;
                    padding: 15px;
                    background: #f9f9f9;
                    border-radius: 8px;
                    display: inline-block;
                }
                .qr-pagina-widget-qr canvas {
                    display: block;
                    margin: 0 auto;
                }
                .qr-pagina-widget-url {
                    margin: 15px 0;
                    padding: 10px;
                    background: #f0f7ff;
                    border-left: 3px solid #667eea;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #555;
                    word-break: break-all;
                    text-align: left;
                }
                .qr-pagina-widget-url strong {
                    color: #667eea;
                    display: block;
                    margin-bottom: 5px;
                }
                .qr-pagina-widget-actions {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-top: 15px;
                }
                .qr-pagina-widget-btn {
                    padding: 10px 15px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 5px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .qr-pagina-widget-btn:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                }
                .qr-pagina-widget-btn-secondary {
                    background: #f0f0f0;
                    color: #333;
                    border: 1px solid #ddd;
                }
                .qr-pagina-widget-btn-secondary:hover {
                    background: #e0e0e0;
                    border-color: #667eea;
                    color: #667eea;
                }
                .qr-pagina-widget-info {
                    margin-top: 15px;
                    padding: 10px;
                    background: #fff3cd;
                    border-left: 3px solid #ffc107;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #856404;
                    text-align: left;
                }
                @media (max-width: 500px) {
                    .qr-pagina-widget-container {
                        padding: 15px;
                    }
                    .qr-pagina-widget-actions {
                        grid-template-columns: 1fr;
                    }
                }
            </style>
            <div class="qr-pagina-widget">
                <div class="qr-pagina-widget-container">
                    <h3>📱 Compartir esta página</h3>
                    <p class="subtitle">Escanea el código QR para abrir esta página en tu móvil</p>
                    
                    <div class="qr-pagina-widget-qr" id="qr-pagina-qr-${options.containerId}"></div>

                    ${options.showUrl ? `
                    <div class="qr-pagina-widget-url" id="qr-pagina-url-${options.containerId}">
                        <strong>URL:</strong>
                        <span id="qr-pagina-url-text-${options.containerId}">${currentUrl}</span>
                    </div>
                    ` : ''}

                    <div class="qr-pagina-widget-actions">
                        ${options.showDownload ? `<button type="button" class="qr-pagina-widget-btn" id="qr-pagina-download-${options.containerId}">📥 Descargar QR</button>` : ''}
                        ${options.showCopy ? `<button type="button" class="qr-pagina-widget-btn qr-pagina-widget-btn-secondary" id="qr-pagina-copy-${options.containerId}">📋 Copiar URL</button>` : ''}
                    </div>

                    <div class="qr-pagina-widget-info">
                        💡 Apunta la cámara de tu móvil al código QR para abrir esta página
                    </div>
                </div>
            </div>
        `;

        // Generar el código QR
        const qrElement = document.getElementById(`qr-pagina-qr-${options.containerId}`);
        if (qrElement && options.autoGenerate) {
            new QRCode(qrElement, {
                text: currentUrl,
                width: options.qrSize,
                height: options.qrSize,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        }

        // Event listeners
        const downloadBtn = document.getElementById(`qr-pagina-download-${options.containerId}`);
        if (downloadBtn) {
            downloadBtn.addEventListener('click', function() {
                const canvas = qrElement.querySelector('canvas');
                if (!canvas) {
                    alert('El código QR aún no se ha generado');
                    return;
                }
                const link = document.createElement('a');
                link.href = canvas.toDataURL('image/png');
                link.download = 'qr-pagina.png';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });
        }

        const copyBtn = document.getElementById(`qr-pagina-copy-${options.containerId}`);
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                navigator.clipboard.writeText(currentUrl).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✓ Copiado';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 2000);
                }).catch(() => {
                    // Fallback
                    const textArea = document.createElement('textarea');
                    textArea.value = currentUrl;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    try {
                        document.execCommand('copy');
                        const originalText = copyBtn.textContent;
                        copyBtn.textContent = '✓ Copiado';
                        setTimeout(() => {
                            copyBtn.textContent = originalText;
                        }, 2000);
                    } catch (err) {
                        alert('No se pudo copiar la URL');
                    }
                    document.body.removeChild(textArea);
                });
            });
        }

        // Retornar función para regenerar QR si es necesario
        return {
            regenerate: function(newUrl) {
                const url = newUrl || currentUrl;
                qrElement.innerHTML = '';
                new QRCode(qrElement, {
                    text: url,
                    width: options.qrSize,
                    height: options.qrSize,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
                if (options.showUrl) {
                    document.getElementById(`qr-pagina-url-text-${options.containerId}`).textContent = url;
                }
            }
        };
    }

    // Auto-inicializar si el contenedor existe
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            if (document.getElementById(defaultConfig.containerId)) {
                initQRWidget();
            }
        });
    } else {
        if (document.getElementById(defaultConfig.containerId)) {
            initQRWidget();
        }
    }

    // Exponer función globalmente
    window.QRPaginaWidget = initQRWidget;
})();
