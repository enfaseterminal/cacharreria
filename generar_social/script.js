const LIMITS = {
    x: 280,
    linkedin: 3000,
    threads: 500,
    facebook: null
};

const IMAGE_SIZES = {
    x: { w: 1200, h: 675 },
    linkedin: { w: 1200, h: 627 },
    facebook: { w: 1200, h: 630 },
    instagram: { w: 1080, h: 1080 }
};

// Objeto de cadenas de texto para internacionalización
const LANGUAGE_STRINGS = {
    es: {
        appTitle: "Social Poster Hub",
        appSubtitle: "Introduce una URL para generar publicaciones optimizadas",
        invalidUrl: "❌ Por favor, introduce una URL válida.",
        gettingInfo: "Obteniendo información...",
        contentGenerated: "✅ ¡Contenido generado con éxito!",
        metadataError: "⚠️ No se pudo extraer metadatos. Generando genérico...",
        fallbackTitle: "Enlace compartido",
        fallbackDescription: "Haz clic para saber más",
        useHashtags: "Incluir Hashtags",
        imageFormat: "Formato de Imagen:",
        xTwitter: "X / Twitter (16:9)",
        linkedin: "LinkedIn (1.91:1)",
        facebook: "Facebook (1.91:1)",
        instagram: "Instagram (1:1)",
        view: "👁️ Ver",
        publish: "🚀 Publicar",
        copy: "Copiar",
        copied: "✓ Copiado",
        pasteUrl: "Pegar URL desde el portapapeles",
        pasteUrlError: "No se pudo acceder al portapapeles automáticamente. Por favor, pega la URL manualmente.",
        previewApprox: "Vista previa aproximada para",
        loading: "Cargando...",
        previewError: "No se pudo cargar la previsualización",
        noTitle: "Sin título",
        noDescription: "Sin descripción disponible",
        downloadImage: "💾 Descargar Imagen de Previsualización",
        formalTone: "👔 Formal",
        funTone: "✨ Divertido",
        clickbaitTone: "🔥 Clickbait",
        exampleUser: "Usuario de Ejemplo",
        postedNow: "Publicado ahora",
        xHandle: "@usuario_ejemplo • ahora",
        like: "👍 Me gusta",
        comment: "💬 Comentar",
        share: "🔄 Compartir",
        recommend: "👍 Recomendar",
        send: "📤 Enviar",
        stats: "📊",
        retweet: "🔁",
        heart: "❤️",
        generateButton: "Generar"
    },
    en: {
        appTitle: "Social Poster Hub",
        appSubtitle: "Enter a URL to generate optimized posts",
        invalidUrl: "❌ Please enter a valid URL.",
        gettingInfo: "Getting information...",
        contentGenerated: "✅ Content generated successfully!",
        metadataError: "⚠️ Could not extract metadata. Generating generic...",
        fallbackTitle: "Shared link",
        fallbackDescription: "Click to learn more",
        useHashtags: "Include Hashtags",
        imageFormat: "Image Format:",
        xTwitter: "X / Twitter (16:9)",
        linkedin: "LinkedIn (1.91:1)",
        facebook: "Facebook (1.91:1)",
        instagram: "Instagram (1:1)",
        view: "👁️ View",
        publish: "🚀 Publish",
        copy: "Copy",
        copied: "✓ Copied",
        pasteUrl: "Paste URL from clipboard",
        pasteUrlError: "Could not access clipboard automatically. Please paste the URL manually.",
        previewApprox: "Approximate preview for",
        loading: "Loading...",
        previewError: "Could not load preview",
        noTitle: "No title",
        noDescription: "No description available",
        downloadImage: "💾 Download Preview Image",
        formalTone: "👔 Formal",
        funTone: "✨ Fun",
        clickbaitTone: "🔥 Clickbait",
        exampleUser: "Example User",
        postedNow: "Posted now",
        xHandle: "@example_user • now",
        like: "👍 Like",
        comment: "💬 Comment",
        share: "🔄 Share",
        recommend: "👍 Recommend",
        send: "📤 Send",
        stats: "📊",
        retweet: "🔁",
        heart: "❤️",
        generateButton: "Generate"
    }
};

const TONE_TEMPLATES = {
    es: { // Spanish templates
        formal: {
            x: (m, h) => `📌 Análisis: "${m.title}".\n\nConsulte los detalles aquí: ${m.url}${h}`,
            linkedin: (m, h) => `Es un placer compartir este contenido sobre "${m.title}".\n\n${m.description}\n\nEn el entorno profesional actual, este tipo de información resulta clave.\n\n🔗 Lectura completa: ${m.url}${h}`,
            facebook: (m, h) => `Os comparto esta lectura sobre "${m.title}".\n\nEspero que os resulte de utilidad para vuestros proyectos.\n\nEcha un vistazo: ${m.url}${h}`,
            threads: (m, h) => `Un recurso fundamental sobre "${m.title}".\n\n${m.url}${h}`
        },
        divertido: {
            x: (m, h) => `¡Vaya joyita! ✨ Tenéis que leer esto sobre "${m.title}".\n\n🔥 No os lo perdáis: ${m.url}${h}`,
            linkedin: (m, h) => `¡Me he topado con esta joya sobre "${m.title}" y tenía que compartirla! 🚀\n\n${m.description}\n\nIdeal para los que buscan algo fresco hoy.\n\n🔗 Lee más aquí: ${m.url}${h}`,
            facebook: (m, h) => `¡Hola familia! Mirad qué pasada de artículo: "${m.title}". Me ha encantado y creo que a vosotros también.\n\nEchadle un ojo: ${m.url}${h}`,
            threads: (m, h) => `¿Habéis visto esto? 🔍 ${m.title} es sencillamente genial. 🔥 No tiene desperdicio.\n\n${m.url}${h}`
        },
        clickbait: {
            x: (m, h) => `🤯 ¡No te vas a creer lo que dice este artículo sobre "${m.title}"! Haz clic ya.\n\n👇 AQUÍ:\n${m.url}${h}`,
            linkedin: (m, h) => `¿Conocías el secreto detrás de "${m.title}"? La respuesta te va a sorprender y cambiará tu perspectiva.\n\n${m.description}\n\n🔗 Descúbrelo aquí: ${m.url}${h}`,
            facebook: (m, h) => `El 99% de la gente no sabe esto sobre "${m.title}". Haz clic para descubrirlo antes de que sea tarde. 😱\n\n${m.url}${h}`,
            threads: (m, h) => `Todo lo que creías saber sobre "${m.title}" está a punto de cambiar... 🧵 Mira por qué:\n\n${m.url}${h}`
        }
    },
    en: { // English templates
        formal: {
            x: (m, h) => `📌 Analysis: "${m.title}".\n\nCheck details here: ${m.url}${h}`,
            linkedin: (m, h) => `We are pleased to share this content about "${m.title}".\n\n${m.description}\n\nIn today's professional environment, this information is key.\n\n🔗 Full read: ${m.url}${h}`,
            facebook: (m, h) => `Sharing this read on "${m.title}".\n\nHope you find it useful for your projects.\n\nTake a look: ${m.url}${h}`,
            threads: (m, h) => `A fundamental resource on "${m.title}".\n\n${m.url}${h}`
        },
        divertido: {
            x: (m, h) => `What a gem! ✨ You have to read this about "${m.title}".\n\n🔥 Don't miss it: ${m.url}${h}`,
            linkedin: (m, h) => `I stumbled upon this gem about "${m.title}" and had to share it! 🚀\n\n${m.description}\n\nPerfect for those looking for something fresh today.\n\n🔗 Read more here: ${m.url}${h}`,
            facebook: (m, h) => `Hey everyone! Check out this amazing article: "${m.title}". I loved it and I think you will too.\n\nTake a look: ${m.url}${h}`,
            threads: (m, h) => `Have you seen this? 🔍 ${m.title} is simply brilliant. 🔥 Don't miss out.\n\n${m.url}${h}`
        },
        clickbait: {
            x: (m, h) => `🤯 You won't believe what this article says about "${m.title}"! Click now.\n\n👇 HERE:\n${m.url}${h}`,
            linkedin: (m, h) => `Did you know the secret behind "${m.title}"? The answer will surprise you and change your perspective.\n\n${m.description}\n\n🔗 Discover it here: ${m.url}${h}`,
            facebook: (m, h) => `99% of people don't know this about "${m.title}". Click to find out before it's too late. 😱\n\n${m.url}${h}`,
            threads: (m, h) => `Everything you thought you knew about "${m.title}" is about to change... 🧵 See why:\n\n${m.url}${h}`
        }
    }
};

async function processUrl() {
    const urlInput = document.getElementById('target-url').value.trim();
    const tone = document.getElementById('tone-select').value;
    const lang = document.getElementById('language-select').value;
    const status = document.getElementById('status');
    const loader = document.getElementById('loader');

    if (!urlInput || !urlInput.startsWith('http')) {
        status.innerText = LANGUAGE_STRINGS[lang].invalidUrl;
        return;
    }

    status.innerText = LANGUAGE_STRINGS[lang].gettingInfo;
    loader.style.display = "block";

    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(urlInput)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(data.contents, 'text/html');

        const meta = {
            title: doc.querySelector('title')?.innerText || LANGUAGE_STRINGS[lang].fallbackTitle,
            description: doc.querySelector('meta[name="description"]')?.content || 
                         doc.querySelector('meta[property="og:description"]')?.content || LANGUAGE_STRINGS[lang].fallbackDescription,
            url: urlInput
        };

        generateDrafts(meta, tone, lang);
        drawPreviewCard(meta);
        status.innerText = LANGUAGE_STRINGS[lang].contentGenerated;
    } catch (error) {
        console.error(error);
        status.innerText = LANGUAGE_STRINGS[lang].metadataError;
        const fallback = { title: LANGUAGE_STRINGS[lang].fallbackTitle, description: LANGUAGE_STRINGS[lang].fallbackDescription, url: urlInput };
        generateDrafts(fallback, tone, lang);
        drawPreviewCard(fallback);
    } finally {
        loader.style.display = "none";
    }
}

function generateDrafts(meta, tone) {
    const lang = document.getElementById('language-select').value;
    const useHashtags = document.getElementById('use-hashtags').checked;
    let hashtagsStr = "";
    
    if (useHashtags) {
        const tags = suggestHashtags(meta.title, meta.description, lang);
        hashtagsStr = "\n\n" + tags.join(' ');
    }

    const templates = TONE_TEMPLATES[lang][tone];
    if (!templates) {
        console.error(`No templates found for language '${lang}' and tone '${tone}'`);
        // Fallback to a default if templates are missing for a language/tone combo
        return;
    }

    const platforms = ['x', 'linkedin', 'facebook', 'threads'];
    platforms.forEach(p => {
        let text = templates[p](meta, hashtagsStr);
        if (LIMITS[p] && text.length > LIMITS[p]) {
            text = text.substring(0, LIMITS[p] - 3) + "...";
        }
        document.getElementById(`text-${p}`).value = text;
        updateCount(p);
    });
}

function suggestHashtags(title, desc, lang) {
    const combined = (title + " " + desc).toLowerCase();
    let commonWords = [];
    if (lang === 'es') {
        commonWords = ['para', 'sobre', 'como', 'este', 'esta', 'todo'];
    } else if (lang === 'en') {
        commonWords = ['for', 'about', 'as', 'this', 'that', 'all', 'the', 'and', 'or'];
    }
    const words = combined.match(/\b(\w{5,})\b/g) || [];
    return [...new Set(words)].filter(w => !commonWords.includes(w)).slice(0, 4).map(w => `#${w}`);
}

function drawPreviewCard(meta) {
    const format = document.getElementById('image-format').value;
    const size = IMAGE_SIZES[format];
    const canvas = document.getElementById('social-canvas');
    const ctx = canvas.getContext('2d');
    const container = document.getElementById('preview-canvas-container');

    canvas.width = size.w;
    canvas.height = size.h;
    container.style.display = "block";

    // Fondo
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#667eea');
    grad.addColorStop(1, '#764ba2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Marco
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.roundRect(30, 30, canvas.width - 60, canvas.height - 60, 15);
    ctx.fill();

    // Texto
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(canvas.width / 20)}px Segoe UI, sans-serif`;
    wrapText(ctx, meta.title, 80, canvas.height/3, canvas.width - 160, Math.floor(canvas.width/18));

    ctx.font = '30px Courier New';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(new URL(meta.url).hostname, 80, canvas.height - 80);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        if (context.measureText(testLine).width > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else { line = testLine; }
    }
    context.fillText(line, x, y);
}

function showFeedPreview(platform) {
    const modal = document.getElementById('preview-modal');
    const container = document.getElementById('mockup-container');
    const text = document.getElementById(`text-${platform}`).value;
    const canvas = document.getElementById('social-canvas');
    const imgData = canvas.toDataURL();

    let platformName = platform.toUpperCase();
    let avatarColor = "#667eea";
    let footerIcons = "💬 🔁 ❤️ 📊";

    if (platform === 'facebook') {
        footerIcons = "👍 Me gusta • 💬 Comentar • 🔄 Compartir";
        avatarColor = "#1877f2";
    } else if (platform === 'linkedin') {
        footerIcons = "👍 Recomendar • 💬 Comentar • 🔁 Compartir • 📤 Enviar";
        avatarColor = "#0077b5";
    }

    container.innerHTML = `
        <div class="feed-mockup">
            <div class="mockup-header">
                <div class="mockup-avatar" style="background: ${avatarColor}"></div>
                <div class="mockup-user-info">
                    <div class="mockup-name">Usuario de Ejemplo</div>
                    <div class="mockup-handle">${platform === 'x' ? '@usuario_ejemplo • ahora' : 'Publicado ahora'}</div>
                </div>
            </div>
            <div class="mockup-text">${text}</div>
            <img src="${imgData}" class="mockup-image" alt="Preview">
            <div class="mockup-footer">
                ${footerIcons}
            </div>
        </div>
        <p style="text-align:center; margin-top:15px; font-size:0.8rem; color:#666;" data-lang-key="previewApprox">
            Vista previa aproximada para <strong>${platformName}</strong>
        </p>
    `;

    modal.style.display = "block";
}

function closePreview() {
    document.getElementById('preview-modal').style.display = "none";
}

// Cerrar modal si se hace clic fuera de él
window.onclick = function(event) {
    const modal = document.getElementById('preview-modal');
    if (event.target == modal) {
        closePreview();
    }
}

function updateCount(platform) {
    const textarea = document.getElementById(`text-${platform}`);
    const counter = document.getElementById(`count-${platform}`);
    const limit = LIMITS[platform];
    if (limit) {
        counter.innerText = `${textarea.value.length} / ${limit}`;
        textarea.value.length > limit ? counter.classList.add('limit') : counter.classList.remove('limit');
    } else {
        counter.innerText = textarea.value.length;
    }
}

function downloadImage() {
    const canvas = document.getElementById('social-canvas');
    const link = document.createElement('a');
    link.download = `preview-${document.getElementById('image-format').value}.png`;
    link.href = canvas.toDataURL();
    link.click();
}

async function pasteUrl() {
    try {
        const lang = document.getElementById('language-select').value;
        const text = await navigator.clipboard.readText();
        document.getElementById('target-url').value = text;
    } catch (err) {
        alert(LANGUAGE_STRINGS[lang].pasteUrlError);
    }
}

function publishText(platform) {
    const text = document.getElementById(`text-${platform}`).value;
    const url = document.getElementById('target-url').value;
    let shareUrl = "";

    switch(platform) {
        case 'x':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
            break;
        case 'threads':
            shareUrl = `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;
            break;
        case 'linkedin':
            // Abre el feed con el cuadro de compartir activo y el texto pre-cargado (vía Web)
            shareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
            break;
        case 'facebook':
            // Facebook no permite pre-rellenar el texto por URL. Abrimos el sharer estándar con la URL.
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
            break;
    }

    if (shareUrl) {
        window.open(shareUrl, '_blank');
    }
}

function copyText(id) {
    const el = document.getElementById(id);
    navigator.clipboard.writeText(el.value).then(() => {
        const lang = document.getElementById('language-select').value;
        // Find the specific copy button for this textarea
        const btn = el.parentElement.querySelector('.copy-btn:last-of-type');
        const old = btn.innerText;
        btn.innerText = LANGUAGE_STRINGS[lang].copied;
        setTimeout(() => btn.innerText = old, 2000);
    });
}

// Función para actualizar la interfaz con el idioma seleccionado
function updateUIWithLanguage() {
    const lang = document.getElementById('language-select').value;
    const strings = LANGUAGE_STRINGS[lang];

    // Actualizar título y subtítulo
    document.querySelector('h1').innerText = strings.appTitle;
    document.querySelector('header p').innerText = strings.appSubtitle;

    // Actualizar botones y labels con data-lang-key
    document.querySelectorAll('[data-lang-key]').forEach(element => {
        const key = element.getAttribute('data-lang-key');
        if (strings[key]) {
            if (element.tagName === 'INPUT' && element.type === 'url') {
                element.placeholder = strings[key];
            } else if (element.tagName === 'BUTTON' && element.id === 'paste-url-btn') {
                element.title = strings[key];
            } else {
                element.innerText = strings[key];
            }
        }
    });
    // Actualizar el botón "Generar"
    document.querySelector('.input-group button:last-of-type').innerText = strings.generateButton;
}

window.onload = () => {
    updateUIWithLanguage(); // Cargar el idioma por defecto al inicio
    Object.keys(LIMITS).forEach(p => updateCount(p));
};