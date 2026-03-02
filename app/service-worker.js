// v2.2
const DB_NAME = 'deeplink-store';
const STORE_NAME = 'pending';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
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

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

// Network-first fetch: always try network, fall back to cache.
// This prevents iOS from serving stale cached files.
self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).then((response) => {
            return response;
        }).catch(() => {
            return caches.match(event.request);
        })
    );
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
