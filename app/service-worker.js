// v2.1
const DB_NAME = 'deeplink-store';
const STORE_NAME = 'pending';
const CORR_DB = 'correlation-store';
const CORR_STORE = 'data';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function openCorrDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CORR_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(CORR_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function savePendingDeeplink(data) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, 'pending_deeplink');
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function saveCorrelation(value) {
    const db = await openCorrDB();
    const tx = db.transaction(CORR_STORE, 'readwrite');
    tx.objectStore(CORR_STORE).put(value, 'correlation_id');
    return new Promise((resolve) => { tx.oncomplete = resolve; });
}

async function getCorrelation() {
    const db = await openCorrDB();
    const tx = db.transaction(CORR_STORE, 'readonly');
    const req = tx.objectStore(CORR_STORE).get('correlation_id');
    return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Handle correlation read/write via postMessage (SW storage is shared between Safari & PWA)
self.addEventListener('message', (event) => {
    if (!event.data) return;

    var port = event.ports && event.ports[0];

    if (event.data.type === 'save-correlation') {
        event.waitUntil(
            saveCorrelation(event.data.value).then(() => {
                if (port) port.postMessage({ type: 'correlation-saved' });
            })
        );
    }

    if (event.data.type === 'get-correlation') {
        event.waitUntil(
            getCorrelation().then((value) => {
                if (port) port.postMessage({ type: 'correlation-value', value: value });
            })
        );
    }
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    if (!data) return;

    const deeplinks = data.deeplinks || (data.deeplink ? [data.deeplink] : null);
    if (!deeplinks || deeplinks.length === 0) return;

    const delay = data.delay || 600;

    event.waitUntil(
        savePendingDeeplink({ deeplinks, delay }).then(() => {
            return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                for (const client of windowClients) {
                    client.postMessage({ type: 'navigate', url: '/pwa-deeplink/app/deeplink-runner.html' });
                    return;
                }
                return clients.openWindow('/pwa-deeplink/app/deeplink-runner.html');
            });
        })
    );
});
