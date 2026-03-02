const sendBtn = document.getElementById('sendPush');
const deeplinkInput = document.getElementById('deeplink');
const delayInput = document.getElementById('delay');
const statusEl = document.getElementById('status');

function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}

// =============== UUID ===============
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
}

function initUUID() {
    var uuidEl = document.getElementById('uuid-value');
    var sourceEl = document.getElementById('uuid-source');
    var existing = getCookie('client_uuid');
    var mode = navigator.standalone ? 'Standalone (PWA)' : 'Browser (Safari)';

    if (existing) {
        uuidEl.textContent = existing;
        sourceEl.textContent = mode + ' — read from cookie';
    } else {
        var uuid = generateUUID();
        setCookie('client_uuid', uuid, 365);
        uuidEl.textContent = uuid;
        sourceEl.textContent = mode + ' — generated & saved';
    }
}

initUUID();

// =============== Correlation ID (IndexedDB — shared between Safari & PWA) ===============
var CORR_DB = 'correlation-store';
var CORR_STORE = 'data';

function openCorrDB() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open(CORR_DB, 1);
        req.onupgradeneeded = function() { req.result.createObjectStore(CORR_STORE); };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function saveCorrelation(value) {
    return openCorrDB().then(function(db) {
        var tx = db.transaction(CORR_STORE, 'readwrite');
        tx.objectStore(CORR_STORE).put(value, 'correlation_id');
        return new Promise(function(resolve) { tx.oncomplete = resolve; });
    });
}

function getCorrelation() {
    return openCorrDB().then(function(db) {
        var tx = db.transaction(CORR_STORE, 'readonly');
        var req = tx.objectStore(CORR_STORE).get('correlation_id');
        return new Promise(function(resolve) {
            req.onsuccess = function() { resolve(req.result || null); };
            req.onerror = function() { resolve(null); };
        });
    });
}

async function initCorrelation() {
    var valEl = document.getElementById('correlation-value');
    var srcEl = document.getElementById('correlation-source');
    var mode = navigator.standalone ? 'Standalone (PWA)' : 'Browser (Safari)';

    // 1. Check query param (Safari landing) — always overwrite
    var params = new URLSearchParams(window.location.search);
    var fromUrl = params.get('correlation');

    if (fromUrl) {
        await saveCorrelation(fromUrl);
        valEl.textContent = fromUrl;
        srcEl.textContent = mode + ' — saved from URL to IndexedDB';
        return;
    }

    // 2. Read from IndexedDB (PWA or repeat visit)
    var fromDB = await getCorrelation();
    if (fromDB) {
        valEl.textContent = fromDB;
        srcEl.textContent = mode + ' — read from IndexedDB';
        return;
    }

    valEl.textContent = '—';
    srcEl.textContent = 'No correlation param. Use ?correlation=XXX';
}

initCorrelation();

// =============== Service Worker ===============
async function registerSW() {
    if (!('serviceWorker' in navigator)) {
        showStatus('Service Worker not supported.', 'error');
        sendBtn.disabled = true;
        return null;
    }
    try {
        const reg = await navigator.serviceWorker.register('/pwa-deeplink/app/service-worker.js', { scope: '/pwa-deeplink/app/' });
        await navigator.serviceWorker.ready;
        return reg;
    } catch (err) {
        showStatus('SW failed: ' + err.message, 'error');
        sendBtn.disabled = true;
        return null;
    }
}

// =============== Notifications ===============
async function requestPermission() {
    if (!('Notification' in window)) {
        showStatus('Notifications not supported.', 'error');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        showStatus('Notifications denied. Enable in Settings.', 'error');
        return false;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') return true;
    showStatus('Permission not granted.', 'error');
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
        showStatus('Enter at least one deep link URL.', 'error');
        return;
    }
    const allowed = await requestPermission();
    if (!allowed) return;

    const deeplinks = parseDeeplinks(raw);
    const delay = parseInt(delayInput.value) || 600;

    const body = deeplinks.length === 1
        ? 'Tap to open: ' + deeplinks[0]
        : 'Tap to try ' + deeplinks.length + ' deeplinks';

    registration.showNotification('Open App', {
        body: body,
        data: { deeplinks: deeplinks, delay: delay },
        requireInteraction: true,
    });
    showStatus('Notification sent! (' + deeplinks.length + ' deeplink(s))', 'success');
}

// =============== SW message handler ===============
// On iOS standalone PWA, the SW cannot use clients.openWindow() or client.navigate().
// Instead the SW sends a postMessage and we navigate from the page itself.
navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'navigate') {
        window.location.href = event.data.url;
    }
});

// =============== Init ===============
(async () => {
    const registration = await registerSW();
    if (!registration) return;

    const mode = navigator.standalone ? 'Standalone' : 'Browser';
    showStatus('Ready. Mode: ' + mode, 'info');

    sendBtn.addEventListener('click', () => sendNotification(registration));
})();
