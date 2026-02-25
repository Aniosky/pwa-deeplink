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

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = event.notification.data;
    if (!data) return;

    // Support both single deeplink and deeplinks array
    const deeplinks = data.deeplinks || (data.deeplink ? [data.deeplink] : null);
    if (!deeplinks || deeplinks.length === 0) return;

    const delay = data.delay || 600;

    event.waitUntil(
        savePendingDeeplink({ deeplinks, delay }).then(() => {
            return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                // Find an existing PWA window and tell it to navigate via postMessage
                // (client.navigate() and client.focus() are not supported on iOS)
                for (const client of windowClients) {
                    client.postMessage({ type: 'navigate', url: '/app/deeplink-runner.html' });
                    return;
                }
                // No existing window — fall back to openWindow (works in browser mode)
                return clients.openWindow('/app/deeplink-runner.html');
            });
        })
    );
});
