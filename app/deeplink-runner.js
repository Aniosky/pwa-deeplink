// =============== IndexedDB helpers ===============
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

async function getPendingDeeplink() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve) => {
        const req = store.get('pending_deeplink');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
    });
}

async function clearPendingDeeplink() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete('pending_deeplink');
}

// =============== UI helpers ===============
const statusText = document.getElementById('status-text');
const currentLink = document.getElementById('current-link');
const progressFill = document.getElementById('progress-fill');
const stepInfo = document.getElementById('step-info');
const logContainer = document.getElementById('log');
const spinner = document.getElementById('spinner');

const FALLBACK_URL = '/app/fallback.html';

function addLog(text, type) {
    const el = document.createElement('div');
    el.className = 'log-entry ' + type;
    el.textContent = text;
    logContainer.appendChild(el);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// =============== Deeplink iteration engine ===============

/**
 * Try to open a single deeplink via window.location.href.
 * iOS Safari ignores custom schemes in hidden iframes —
 * only a direct location change triggers the system dialog.
 *
 * Returns a promise that resolves to true if the app opened
 * (visibilitychange/pagehide fired), or false after timeout.
 */
function tryDeeplink(url, timeout) {
    return new Promise((resolve) => {
        let settled = false;

        function onLeave() {
            if (document.hidden || document.visibilityState === 'hidden') {
                settled = true;
                cleanup();
                resolve(true);
            }
        }

        function cleanup() {
            document.removeEventListener('visibilitychange', onLeave);
            window.removeEventListener('pagehide', onLeave);
        }

        document.addEventListener('visibilitychange', onLeave);
        window.addEventListener('pagehide', onLeave);

        // Direct location assignment — the only way to trigger
        // Safari's "Open in app?" dialog for custom schemes
        window.location.href = url;

        setTimeout(() => {
            cleanup();
            if (!settled) resolve(false);
        }, timeout);
    });
}

/**
 * Iterate through the deeplinks array one by one.
 * First success wins. If all fail — redirect to fallback.
 */
async function runDeeplinks(deeplinks, delay) {
    const total = deeplinks.length;

    for (let i = 0; i < total; i++) {
        const url = deeplinks[i];
        const step = i + 1;

        // Update UI
        statusText.textContent = 'Trying deeplink ' + step + ' of ' + total + '...';
        currentLink.textContent = url;
        progressFill.style.width = ((step / total) * 100) + '%';
        stepInfo.textContent = 'Step ' + step + '/' + total;
        addLog('[' + step + '] Trying: ' + url, 'try');

        const opened = await tryDeeplink(url, delay);

        if (opened) {
            addLog('[' + step + '] App opened!', 'ok');
            statusText.textContent = 'App opened!';
            spinner.style.display = 'none';
            return; // success — stop iterating
        }

        addLog('[' + step + '] No response — skipping', 'fail');
    }

    // All deeplinks failed
    statusText.textContent = 'No app found. Redirecting...';
    spinner.style.borderTopColor = '#e87070';
    addLog('All deeplinks failed. Going to fallback.', 'fail');

    setTimeout(() => {
        window.location.href = FALLBACK_URL;
    }, 600);
}

// =============== Init ===============
(async () => {
    const pending = await getPendingDeeplink();
    if (!pending) {
        statusText.textContent = 'No pending deeplink.';
        spinner.style.display = 'none';
        return;
    }

    await clearPendingDeeplink();

    const deeplinks = pending.deeplinks || [pending.url];
    const delay = pending.delay || 600;

    addLog('Loaded ' + deeplinks.length + ' deeplink(s), delay=' + delay + 'ms', 'try');

    await runDeeplinks(deeplinks, delay);
})();
