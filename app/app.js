const sendBtn = document.getElementById('sendPush');
const getTokenBtn = document.getElementById('getToken');
const deeplinkInput = document.getElementById('deeplink');
const delayInput = document.getElementById('delay');
const statusEl = document.getElementById('status');

function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}

// =============== Cookies ===============
function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
}

// =============== Correlation ID ===============
function refreshCorrelation() {
    var valEl = document.getElementById('correlation-value');
    var srcEl = document.getElementById('correlation-source');
    var mode = navigator.standalone ? 'Standalone (PWA)' : 'Browser (Safari)';

    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('correlation');

    if (fromUrl) {
        setCookie('correlation_id', fromUrl, 365);
        valEl.textContent = fromUrl;
        srcEl.textContent = mode + ' — сохранено из URL';
        return;
    }

    var fromCookie = getCookie('correlation_id');
    if (fromCookie) {
        valEl.textContent = fromCookie;
        srcEl.textContent = mode + ' — из cookie';
        return;
    }

    valEl.textContent = '—';
    srcEl.textContent = 'Нет correlation. Используй ?correlation=XXX';
}

refreshCorrelation();

document.addEventListener('visibilitychange', function() {
    if (!document.hidden) refreshCorrelation();
});

// =============== Fake Push Token ===============
function generateFakeToken() {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    var token = '';
    for (var i = 0; i < 163; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

getTokenBtn.addEventListener('click', function() {
    var raw = deeplinkInput.value.trim();
    if (!raw) {
        showStatus('Введи хотя бы один deep link.', 'error');
        return;
    }
    var deeplinks = parseDeeplinks(raw);
    var lastLink = deeplinks[deeplinks.length - 1];
    var token = generateFakeToken();
    var separator = lastLink.indexOf('?') === -1 ? '?' : '&';
    var url = lastLink + separator + 'token=' + token;
    showStatus('Открываю: ' + url, 'info');
    window.location.href = url;
});

// =============== Service Worker ===============
async function registerSW() {
    if (!('serviceWorker' in navigator)) {
        showStatus('Service Worker не поддерживается.', 'error');
        sendBtn.disabled = true;
        return null;
    }
    try {
        const reg = await navigator.serviceWorker.register('/pwa-deeplink/app/service-worker.js', { scope: '/pwa-deeplink/app/' });
        await navigator.serviceWorker.ready;
        return reg;
    } catch (err) {
        showStatus('SW ошибка: ' + err.message, 'error');
        sendBtn.disabled = true;
        return null;
    }
}

// =============== Notifications ===============
async function requestPermission() {
    if (!('Notification' in window)) {
        showStatus('Уведомления не поддерживаются.', 'error');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        showStatus('Уведомления запрещены. Включи в Настройках.', 'error');
        return false;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') return true;
    showStatus('Разрешение не получено.', 'error');
    return false;
}

function parseDeeplinks(raw) {
    return raw
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
}

async function sendNotification(registration) {
    const raw = deeplinkInput.value.trim();
    if (!raw) {
        showStatus('Введи хотя бы один deep link.', 'error');
        return;
    }
    const allowed = await requestPermission();
    if (!allowed) return;

    const deeplinks = parseDeeplinks(raw);
    const delay = parseInt(delayInput.value) || 600;

    const body = deeplinks.length === 1
        ? 'Нажми чтобы открыть: ' + deeplinks[0]
        : 'Нажми чтобы попробовать ' + deeplinks.length + ' ссылок';

    registration.showNotification('Открыть приложение', {
        body: body,
        data: { deeplinks: deeplinks, delay: delay },
        requireInteraction: true,
    });
    showStatus('Push отправлен! (' + deeplinks.length + ' ссылок)', 'success');
}

// =============== SW message handler ===============
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'navigate') {
        window.location.href = event.data.url;
    }
});

// =============== Init ===============
(async () => {
    const registration = await registerSW();
    if (!registration) return;

    registration.update();
    registration.addEventListener('updatefound', () => {
        var newSW = registration.installing;
        newSW.addEventListener('statechange', () => {
            if (newSW.state === 'activated') {
                window.location.reload();
            }
        });
    });

    const mode = navigator.standalone ? 'Standalone' : 'Browser';
    showStatus('Готово. Режим: ' + mode, 'info');

    sendBtn.addEventListener('click', () => sendNotification(registration));
})();
