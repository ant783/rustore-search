// ============================================================
//  RuStore через прокси-сервер (автоматический выбор)
//  Поддерживает: GitHub Pages, Vercel, localhost
// ============================================================

// -------- АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ПРОКСИ --------
function getApiBase() {
    const hostname = window.location.hostname;
    
    // Если сайт запущен на GitHub Pages — используем Vercel-прокси
    if (hostname.includes('github.io')) {
        return 'https://rustore-search.vercel.app/api/';
    }
    
    // Для Vercel и localhost используем относительный путь /api/
    // (предполагается, что на этих платформах настроен прокси)
    return '/api/';
}

const API_BASE = getApiBase();
console.log('🔧 API_BASE:', API_BASE); // для отладки

const TIMEOUT_SEARCH = 15000;
const TIMEOUT_DOWNLOAD = 20000;

// ---- Вспомогательные функции ----
const escapeHtml = (value) => {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const createRatingStars = rating => {
    const safeRating = typeof rating === 'number' && !isNaN(rating) ? rating : 0;
    const fullStars = Math.floor(safeRating);
    const hasHalfStar = safeRating % 1 >= 0.5;
    return Array.from({ length: 5 }, (_, i) =>
        i < fullStars ? '<span class="rating-star">★</span>' :
        (i === fullStars && hasHalfStar) ? '<span class="rating-star">⯪</span>' :
        '<span class="text-gray-300">★</span>'
    ).join('');
};

const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
};

// ---- Modal Manager ----
const ModalManager = {
    show(modalId, contentId, content) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        if (contentId) {
            const contentEl = document.getElementById(contentId);
            if (contentEl) contentEl.innerHTML = content;
        }
        modal.classList.remove('hidden');
        modal.classList.add('show');
    },
    hide(modalId, contentId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('show');
        if (contentId) {
            const contentEl = document.getElementById(contentId);
            if (contentEl) contentEl.innerHTML = '';
        }
    },
    showError(containerId, title, message) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = `
            <div class="col-span-full text-center p-4 bg-red-50 rounded-lg">
                <p class="text-red-600 font-medium">${escapeHtml(title)}</p>
                <p class="text-red-500 text-sm mt-2">${escapeHtml(message)}</p>
            </div>
        `;
    }
};

// ---- State ----
const state = {
    controller: null,
    page: 0,
    isLoading: false,
    hasMorePages: true,
    query: '',
    reset() {
        if (this.controller) this.controller.abort();
        this.controller = new AbortController();
        this.page = 0;
        this.hasMorePages = true;
    }
};

// ============================================================
//  УНИВЕРСАЛЬНЫЙ FETCH ЧЕРЕЗ ПРОКСИ
// ============================================================
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_SEARCH) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        // Убираем ведущие слеши и формируем полный URL через прокси
        const proxyUrl = API_BASE + url.replace(/^\/+/, '');
        console.log('🔄 Запрос к прокси:', proxyUrl); // для отладки
        
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

// ---- Получение деталей приложения ----
async function fetchAppDetails(packageName, { signal } = {}) {
    try {
        const url = `applicationData/overallInfo/${packageName}`;
        const response = await fetchWithTimeout(url, { signal }, TIMEOUT_SEARCH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.code === 'OK' && data.body) return data.body;
        return null;
    } catch (error) {
        if (error.name !== 'AbortError') console.error('Ошибка деталей:', error);
        return null;
    }
}

// ---- Поиск приложений ----
async function searchApps(query, isLoadMore = false) {
    if (!isLoadMore) {
        state.reset();
        state.query = query;
        state.isLoading = false;
    }
    if (!query.trim() || state.isLoading || !state.hasMorePages) return;

    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    if (!isLoadMore) {
        resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Поиск...</p></div>';
    }

    state.isLoading = true;
    try {
        const url = `applicationData/apps?pageNumber=${state.page}&pageSize=20&query=${encodeURIComponent(query.trim())}`;
        const response = await fetchWithTimeout(url, { signal: state.controller.signal }, TIMEOUT_SEARCH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (query !== state.query) return;

        if (data.code === 'OK' && data.body) {
            const results = data.body.content;
            if (!isLoadMore) resultsContainer.innerHTML = '';

            if (!results || results.length === 0) {
                if (!isLoadMore) {
                    resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Приложения не найдены</p></div>';
                }
                state.hasMorePages = false;
                return;
            }

            for (const app of results) {
                if (query !== state.query) return;
                const appDetails = await fetchAppDetails(app.packageName, { signal: state.controller.signal });
                if (appDetails && query === state.query) {
                    resultsContainer.appendChild(createAppCard(appDetails, app));
                }
            }
            state.hasMorePages = state.page < data.body.totalPages - 1;
            state.page++;
        } else {
            throw new Error('API вернул ошибку');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Ошибка поиска:', error);
            if (!isLoadMore && query === state.query) {
                let msg = 'Проверьте интернет-соединение и адрес прокси.';
                ModalManager.showError('searchResults', 'Не удалось подключиться к RuStore', msg);
            }
        }
    } finally {
        if (query === state.query) state.isLoading = false;
    }
}

// ---- Создание карточки приложения ----
function createAppCard(appDetails, app) {
    const screenshots = (appDetails.fileUrls || []).sort((a, b) => a.ordinal - b.ordinal);
    const iconUrl = escapeHtml(appDetails.iconUrl || '');
    const appName = escapeHtml(appDetails.appName || '');
    const packageName = escapeHtml(appDetails.packageName || '');
    const shortDescription = escapeHtml(appDetails.shortDescription || '');
    const appId = escapeHtml(String(appDetails.appId));
    const versionCode = escapeHtml(String(appDetails.versionCode));
    const fileSize = formatFileSize(appDetails.fileSize || 0);
    const versionName = escapeHtml(appDetails.versionName || '');
    const downloads = (appDetails.downloads || 0).toLocaleString();
    const rating = app.averageUserRating || 0;
    const totalRatings = (app.totalRatings || 0).toLocaleString();
    const ratingStars = createRatingStars(rating);
    const ratingValue = rating.toFixed(1);
    const fullDescription = appDetails.fullDescription || '';
    const descJson = JSON.stringify(fullDescription);

    let screenshotsHtml = '';
    for (const s of screenshots) {
        const src = escapeHtml(s.fileUrl);
        screenshotsHtml += `<img src="${src}" alt="Screenshot" class="w-40 cursor-pointer rounded shadow" onclick="openPreview('${src}', event)">`;
    }

    const card = document.createElement('div');
    card.className = 'app-card p-4 flex flex-col justify-between h-full';
    card.innerHTML = `
        <div class="flex items-start gap-4">
            <img src="${iconUrl}" alt="${appName}" class="w-20 h-20 rounded-lg" onerror="this.src='https://via.placeholder.com/80'">
            <div class="flex-1 flex flex-col min-w-0">
                <h2 class="text-xl font-bold break-words">${appName}</h2>
                <p class="text-gray-600 break-words text-sm" title="${packageName}">${packageName}</p>
                <div class="rating mt-2">
                    ${ratingStars}
                    ${ratingValue}
                    <span class="text-sm text-gray-600">(${totalRatings})</span>
                </div>
            </div>
        </div>
        <div class="mt-4">
            <p class="text-gray-700 text-sm">${shortDescription}</p>
            <button class="description-toggle mt-2 text-blue-600 text-sm" data-name="${appName}" data-desc='${descJson}'>Показать полное описание</button>
        </div>
        ${screenshotsHtml ? `<div class="screenshots-container my-4 flex gap-2 overflow-x-auto">${screenshotsHtml}</div>` : ''}
        <div class="grid grid-cols-2 gap-1 text-sm text-gray-600 mt-2">
            <div>Версия: ${versionName}</div>
            <div>Размер: ~${fileSize}</div>
            <div>Загрузок: ${downloads}</div>
            <div>App ID: ${appId}</div>
        </div>
        <div class="mt-4 flex justify-between items-center">
            <button class="download-btn bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" 
                    data-appid="${appDetails.appId}" 
                    data-sdk="${appDetails.minSdkVersion}" 
                    data-appname="${appName}" 
                    data-versionname="${versionName}">
                Скачать APK
            </button>
        </div>
    `;

    card.querySelector('.description-toggle')?.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-name');
        const desc = e.currentTarget.getAttribute('data-desc');
        showDescription(name, desc);
    });
    card.querySelector('.download-btn')?.addEventListener('click', (e) => {
        const appId = parseInt(e.currentTarget.getAttribute('data-appid'));
        const sdk = parseInt(e.currentTarget.getAttribute('data-sdk'));
        const appName = e.currentTarget.getAttribute('data-appname');
        const versionName = e.currentTarget.getAttribute('data-versionname');
        downloadApp(appId, sdk, appName, versionName);
    });

    return card;
}

// ---- Скачивание APK ----
async function downloadApp(appId, sdkVersion, appName, versionName, options = {}) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4">Получение ссылки...</div>');
    const container = document.getElementById('downloadResults');
    if (!container) return;

    const sanitizeFileName = (name) => {
        return name.replace(/[\\/*?:"<>|]/g, '_').replace(/\s+/g, '_').trim();
    };
    const safeAppName = sanitizeFileName(appName || 'app');
    const safeVersion = sanitizeFileName(versionName || 'unknown');
    const suggestedFileName = `${safeAppName}_${safeVersion}.apk`;

    try {
        const density = options.screenDensity || 320;
        const url = `applicationData/v2/download-link`;
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            body: JSON.stringify({
                appId,
                firstInstall: true,
                mobileServices: [],
                supportedAbis: ['arm64-v8a', 'armeabi-v7a'],
                screenDensity: density,
                supportedLocales: ['ru_RU'],
                sdkVersion,
                withoutSplits: false,
                signatureFingerprint: null
            })
        }, TIMEOUT_DOWNLOAD);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.code === 'OK' && data.body?.downloadUrls?.length) {
            const urls = data.body.downloadUrls;
            container.innerHTML = `
                <div class="space-y-3">
                    <div class="p-3 bg-yellow-50 rounded border border-yellow-200">
                        <div class="font-semibold text-yellow-800">⚠️ Сохранение с правильным именем</div>
                        <div class="text-sm text-yellow-700 mt-1">
                            Нажмите правой кнопкой по ссылке и выберите «Сохранить ссылку как…»<br>
                            Имя файла: <strong>${escapeHtml(suggestedFileName)}</strong>
                        </div>
                    </div>
                    <div class="font-semibold">Ссылки для скачивания:</div>
                    ${urls.map((u, idx) => `
                        <div class="p-2 bg-gray-50 rounded break-all">
                            <div class="text-sm text-gray-600 mb-1">Файл ${idx+1}</div>
                            <a href="${escapeHtml(u.url)}" target="_blank" class="text-blue-600 underline text-sm">${escapeHtml(u.url)}</a>
                        </div>
                    `).join('')}
                    <div class="mt-4 p-3 bg-gray-100 rounded">
                        <div class="font-semibold">Команды для загрузки:</div>
                        <div class="mt-2">
                            <div class="text-sm font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                                curl -L -o "${suggestedFileName}" "${escapeHtml(urls[0].url)}"
                            </div>
                            <button id="copyCurlCmd" class="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">Копировать curl</button>
                        </div>
                        <div class="mt-2">
                            <div class="text-sm font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                                wget -O "${suggestedFileName}" "${escapeHtml(urls[0].url)}"
                            </div>
                            <button id="copyWgetCmd" class="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">Копировать wget</button>
                        </div>
                    </div>
                </div>
            `;

            document.getElementById('copyCurlCmd')?.addEventListener('click', async () => {
                await navigator.clipboard.writeText(`curl -L -o "${suggestedFileName}" "${urls[0].url}"`);
                alert('Команда curl скопирована');
            });
            document.getElementById('copyWgetCmd')?.addEventListener('click', async () => {
                await navigator.clipboard.writeText(`wget -O "${suggestedFileName}" "${urls[0].url}"`);
                alert('Команда wget скопирована');
            });
        } else {
            container.innerHTML = '<div class="text-red-600">Не удалось получить ссылки для скачивания</div>';
        }
    } catch (error) {
        container.innerHTML = `<div class="text-red-600">Ошибка: ${error.message}</div>`;
    }
}

// ---- Описание ----
function showDescription(appName, description) {
    const modal = document.getElementById('descriptionModal');
    const content = document.getElementById('descriptionContent');
    if (!modal || !content) return;
    modal.querySelector('h2').textContent = `${appName} — Описание`;
    content.textContent = description;
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

// ---- Заглушки ----
function searchByUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (url) window.open(url, '_blank');
}
function openPreview(imageUrl, event) {}
function closeImagePreview() {}
function navigateImage(dir) {}

// ---- Инициализация ----
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const clearSearch = document.getElementById('clearSearch');
    const urlInput = document.getElementById('urlInput');
    const clearUrl = document.getElementById('clearUrlSearch');
    const searchUrlBtn = document.getElementById('searchByUrlBtn');

    let timeout;
    searchInput?.addEventListener('input', e => {
        clearTimeout(timeout);
        timeout = setTimeout(() => searchApps(e.target.value), 500);
        clearSearch.classList.toggle('hidden', !e.target.value);
    });
    clearSearch?.addEventListener('click', () => {
        searchInput.value = '';
        clearSearch.classList.add('hidden');
        document.getElementById('searchResults').innerHTML = '';
        state.reset();
        state.query = '';
    });
    urlInput?.addEventListener('input', () => clearUrl.classList.toggle('hidden', !urlInput.value));
    clearUrl?.addEventListener('click', () => {
        urlInput.value = '';
        clearUrl.classList.add('hidden');
    });
    searchUrlBtn?.addEventListener('click', searchByUrl);

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal?.id === 'imagePreviewModal') closeImagePreview();
            else ModalManager.hide(modal?.id, modal?.querySelector('[id]')?.id);
        });
    });
    document.addEventListener('keydown', e => {
        const modal = document.getElementById('imagePreviewModal');
        if (modal?.classList.contains('show') && e.key === 'Escape') closeImagePreview();
    });
    window.onclick = e => {
        if (e.target.classList?.contains('modal')) {
            if (e.target.id === 'imagePreviewModal') closeImagePreview();
            else ModalManager.hide(e.target.id, e.target.querySelector('[id]')?.id);
        }
    };

    window.addEventListener('scroll', () => {
        if (state.isLoading || !state.hasMorePages) return;
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
            searchApps(state.query, true);
        }
    });
});
