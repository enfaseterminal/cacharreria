/**
 * Preview Hover - Script embebible
 * Muestra previsualización de enlaces al pasar el ratón sobre ellos
 * 
 * Uso:
 * 1. Incluye este script: <script src="hover-preview.js"></script>
 * 2. Los enlaces con clase 'preview-link' o todos los enlaces externos mostrarán preview automáticamente
 * 
 * Opciones:
 * - Aplicar solo a enlaces con clase 'preview-link'
 * - Aplicar a todos los enlaces externos
 * - Configuración personalizada
 */

(function() {
    'use strict';

    // Configuración por defecto
    const defaultConfig = {
        selector: 'a.preview-link', // Selector CSS para enlaces
        applyToAllExternal: false,   // Aplicar a todos los enlaces externos
        delay: 500,                   // Delay antes de mostrar (ms)
        position: 'bottom',           // Posición: 'top', 'bottom', 'left', 'right'
        maxWidth: 400,                // Ancho máximo del preview
        cache: true,                  // Cachear previsualizaciones
        zIndex: 10000                 // Z-index del tooltip
    };

    // Cache de previsualizaciones
    const previewCache = new Map();
    let currentTimeout = null;
    let currentTooltip = null;
    let currentLink = null;

    // Crear tooltip
    function createTooltip() {
        const tooltip = document.createElement('div');
        tooltip.className = 'hover-preview-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: white;
            border-radius: 8px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: ${defaultConfig.zIndex};
            max-width: ${defaultConfig.maxWidth}px;
            opacity: 0;
            transform: scale(0.95);
            transition: opacity 0.2s, transform 0.2s;
            pointer-events: none;
            overflow: hidden;
        `;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    // Estilos CSS
    function injectStyles() {
        if (document.getElementById('hover-preview-styles')) return;

        const style = document.createElement('style');
        style.id = 'hover-preview-styles';
        style.textContent = `
            .hover-preview-tooltip {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }
            .hover-preview-tooltip.show {
                opacity: 1 !important;
                transform: scale(1) !important;
            }
            .hover-preview-content {
                padding: 0;
            }
            .hover-preview-image {
                width: 100%;
                max-height: 200px;
                object-fit: cover;
                display: block;
            }
            .hover-preview-body {
                padding: 15px;
            }
            .hover-preview-title {
                color: #333;
                font-size: 16px;
                font-weight: 600;
                margin: 0 0 8px 0;
                line-height: 1.3;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .hover-preview-description {
                color: #666;
                font-size: 13px;
                line-height: 1.5;
                margin: 0 0 10px 0;
                display: -webkit-box;
                -webkit-line-clamp: 3;
                -webkit-box-orient: vertical;
                overflow: hidden;
            }
            .hover-preview-url {
                color: #667eea;
                font-size: 11px;
                word-break: break-all;
                margin: 0;
                padding: 8px;
                background: #f0f7ff;
                border-top: 1px solid #e0e0e0;
            }
            .hover-preview-loading {
                padding: 40px 20px;
                text-align: center;
                color: #666;
            }
            .hover-preview-spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                width: 30px;
                height: 30px;
                animation: hover-preview-spin 1s linear infinite;
                margin: 0 auto 10px;
            }
            @keyframes hover-preview-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            .hover-preview-error {
                padding: 20px;
                color: #c00;
                text-align: center;
                font-size: 13px;
            }
        `;
        document.head.appendChild(style);
    }

    // Obtener previsualización
    async function fetchPreview(url) {
        // Verificar cache
        if (defaultConfig.cache && previewCache.has(url)) {
            return previewCache.get(url);
        }

        try {
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);
            const data = await response.json();
            
            if (!data.contents) {
                throw new Error('No se pudo obtener el contenido');
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(data.contents, 'text/html');

            const title = doc.querySelector('title')?.textContent || 
                         doc.querySelector('meta[property="og:title"]')?.content ||
                         doc.querySelector('meta[name="twitter:title"]')?.content ||
                         'Sin título';

            const description = doc.querySelector('meta[property="og:description"]')?.content ||
                              doc.querySelector('meta[name="description"]')?.content ||
                              doc.querySelector('meta[name="twitter:description"]')?.content ||
                              'Sin descripción disponible';

            const image = doc.querySelector('meta[property="og:image"]')?.content ||
                        doc.querySelector('meta[name="twitter:image"]')?.content ||
                        null;

            let imageUrl = image;
            if (image && !image.startsWith('http')) {
                try {
                    const urlObj = new URL(url);
                    if (image.startsWith('//')) {
                        imageUrl = urlObj.protocol + image;
                    } else if (image.startsWith('/')) {
                        imageUrl = urlObj.origin + image;
                    } else {
                        imageUrl = urlObj.origin + '/' + image;
                    }
                } catch (e) {
                    imageUrl = image;
                }
            }

            const preview = {
                title: title.trim(),
                description: description.trim(),
                image: imageUrl,
                url: url
            };

            // Guardar en cache
            if (defaultConfig.cache) {
                previewCache.set(url, preview);
            }

            return preview;
        } catch (error) {
            console.error('Error fetching preview:', error);
            throw error;
        }
    }

    // Mostrar tooltip
    function showTooltip(link, preview) {
        if (!currentTooltip) {
            currentTooltip = createTooltip();
        }

        const tooltip = currentTooltip;
        
        // Contenido del tooltip
        let html = '<div class="hover-preview-content">';
        
        if (preview.image) {
            html += `<img src="${preview.image}" alt="${preview.title}" class="hover-preview-image" onerror="this.style.display='none'">`;
        }
        
        html += '<div class="hover-preview-body">';
        
        if (preview.title) {
            html += `<h3 class="hover-preview-title">${preview.title}</h3>`;
        }
        
        if (preview.description) {
            html += `<p class="hover-preview-description">${preview.description}</p>`;
        }
        
        html += '</div>';
        html += `<div class="hover-preview-url">${preview.url}</div>`;
        html += '</div>';

        tooltip.innerHTML = html;
        document.body.appendChild(tooltip);

        // Posicionar tooltip
        positionTooltip(link, tooltip);

        // Mostrar con animación
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }

    // Mostrar loading
    function showLoading(link) {
        if (!currentTooltip) {
            currentTooltip = createTooltip();
        }

        const tooltip = currentTooltip;
        tooltip.innerHTML = `
            <div class="hover-preview-loading">
                <div class="hover-preview-spinner"></div>
                <p>Cargando...</p>
            </div>
        `;
        document.body.appendChild(tooltip);
        positionTooltip(link, tooltip);
        
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }

    // Mostrar error
    function showError(link, message) {
        if (!currentTooltip) {
            currentTooltip = createTooltip();
        }

        const tooltip = currentTooltip;
        tooltip.innerHTML = `
            <div class="hover-preview-error">
                ${message}
            </div>
        `;
        document.body.appendChild(tooltip);
        positionTooltip(link, tooltip);
        
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 10);
    }

    // Posicionar tooltip
    function positionTooltip(link, tooltip) {
        const rect = link.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;
        const spacing = 10;

        let top, left;

        switch (defaultConfig.position) {
            case 'top':
                top = rect.top + scrollY - tooltipRect.height - spacing;
                left = rect.left + scrollX + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'bottom':
                top = rect.bottom + scrollY + spacing;
                left = rect.left + scrollX + (rect.width / 2) - (tooltipRect.width / 2);
                break;
            case 'left':
                top = rect.top + scrollY + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.left + scrollX - tooltipRect.width - spacing;
                break;
            case 'right':
                top = rect.top + scrollY + (rect.height / 2) - (tooltipRect.height / 2);
                left = rect.right + scrollX + spacing;
                break;
            default:
                top = rect.bottom + scrollY + spacing;
                left = rect.left + scrollX + (rect.width / 2) - (tooltipRect.width / 2);
        }

        // Ajustar si se sale de la pantalla
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        if (left < 10) left = 10;
        if (left + tooltipRect.width > viewportWidth - 10) {
            left = viewportWidth - tooltipRect.width - 10;
        }

        if (top < 10) top = 10;
        if (top + tooltipRect.height > viewportHeight + scrollY - 10) {
            top = rect.top + scrollY - tooltipRect.height - spacing;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
    }

    // Ocultar tooltip
    function hideTooltip() {
        if (currentTooltip) {
            currentTooltip.classList.remove('show');
            setTimeout(() => {
                if (currentTooltip && currentTooltip.parentNode) {
                    currentTooltip.parentNode.removeChild(currentTooltip);
                }
                currentTooltip = null;
            }, 200);
        }
        if (currentTimeout) {
            clearTimeout(currentTimeout);
            currentTimeout = null;
        }
        currentLink = null;
    }

    // Manejar hover
    function handleMouseEnter(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const url = link.href;
        if (!url || url.startsWith('javascript:') || url.startsWith('#')) return;

        // Validar que sea una URL externa o configurada
        try {
            const linkUrl = new URL(url);
            const currentUrl = new URL(window.location.href);
            
            // Si no es externo y no está configurado para todos, saltar
            if (linkUrl.origin === currentUrl.origin && !defaultConfig.applyToAllExternal) {
                return;
            }
        } catch (e) {
            return;
        }

        currentLink = link;
        showLoading(link);

        currentTimeout = setTimeout(async () => {
            try {
                const preview = await fetchPreview(url);
                if (currentLink === link) {
                    showTooltip(link, preview);
                }
            } catch (error) {
                if (currentLink === link) {
                    showError(link, 'No se pudo cargar la previsualización');
                }
            }
        }, defaultConfig.delay);
    }

    function handleMouseLeave() {
        hideTooltip();
    }

    // Inicializar
    function init(config = {}) {
        Object.assign(defaultConfig, config);
        injectStyles();

        // Determinar selector
        let selector = defaultConfig.selector;
        if (defaultConfig.applyToAllExternal) {
            selector = 'a[href^="http"]';
        }

        // Aplicar a enlaces existentes
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('mouseenter', handleMouseEnter);
            link.addEventListener('mouseleave', handleMouseLeave);
        });

        // Observar nuevos enlaces (si se añaden dinámicamente)
        if (window.MutationObserver) {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { // Element node
                            if (node.matches && node.matches(selector)) {
                                node.addEventListener('mouseenter', handleMouseEnter);
                                node.addEventListener('mouseleave', handleMouseLeave);
                            }
                            // También buscar enlaces dentro del nodo
                            node.querySelectorAll && node.querySelectorAll(selector).forEach(link => {
                                link.addEventListener('mouseenter', handleMouseEnter);
                                link.addEventListener('mouseleave', handleMouseLeave);
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    // Auto-inicializar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }

    // Exponer función globalmente
    window.HoverPreview = {
        init: init,
        clearCache: () => previewCache.clear()
    };
})();
