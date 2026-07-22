// ============================================================
//  RuStore через свой прокси на Vercel
//  Укажите ваш адрес прокси в переменной PROXY_BASE
// ============================================================

// -------- НАСТРОЙКА ПРОКСИ (укажите свой URL) --------
const PROXY_BASE = 'https://rustore-search.vercel.app/api/'; // ← замените на ваш

// ВСЕ API-ЗАПРОСЫ ИДУТ ЧЕРЕЗ ПРОКСИ
// Например: PROXY_BASE + 'applicationData/apps?query=...'
// ------------------------------------------------------

const TIMEOUT_SEARCH = 15000;
const TIMEOUT_DOWNLOAD = 20000;

// ---- Остальной код без изменений (escHtml, ModalManager, State) ----
// Я приведу только ключевые функции с учётом прокси, а полный код дам в конце.

// ---- Универсальный fetch с прокси ----
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_SEARCH) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        // Если URL начинается с http, заменяем на прокси-версию
        // Мы будем передавать относительные пути, например "applicationData/apps"
        const proxyUrl = url.startsWith('/') ? PROXY_BASE + url.slice(1) : PROXY_BASE + url;
        const response = await fetch(proxyUrl, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'ruStoreVerCode': '247',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...(options.headers || {})
            }
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ---- Пример использования: поиск ----
async function searchApps(query, isLoadMore = false) {
    // ... (код аналогичен предыдущему, но URL теперь просто "applicationData/apps")
    const url = `applicationData/apps?pageNumber=${state.page}&pageSize=20&query=${encodeURIComponent(query.trim())}`;
    const response = await fetchWithTimeout(url, { signal: state.controller.signal }, TIMEOUT_SEARCH);
    // ...
}

// ---- Пример получения деталей ----
async function fetchAppDetails(packageName, { signal } = {}) {
    const url = `applicationData/overallInfo/${packageName}`;
    const response = await fetchWithTimeout(url, { signal }, TIMEOUT_SEARCH);
    // ...
}

// ---- Пример скачивания (POST) ----
async function downloadApp(appId, sdkVersion, appName, versionName, options = {}) {
    const url = `applicationData/v2/download-link`;
    const response = await fetchWithTimeout(url, {
        method: 'POST',
        body: JSON.stringify({ appId, ... })
    }, TIMEOUT_DOWNLOAD);
    // ...
}
