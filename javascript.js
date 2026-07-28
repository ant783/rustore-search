// ============================================================
//  RuStore Downloader
//  Автоматический выбор прокси:
//    - GitHub Pages → https://rustore-xi.vercel.app/api/
//    - Vercel / локально → /api/
// ============================================================

// -------- АВТОМАТИЧЕСКОЕ ОПРЕДЕЛЕНИЕ ПРОКСИ --------
function getApiBase() {
    const hostname = window.location.hostname;
    // Если сайт запущен на GitHub Pages — используем Vercel-прокси
    if (hostname.includes('github.io')) {
        return 'https://rustore-search.vercel.app/api/';
    }
    // Для Vercel и локальной разработки используем относительный путь
    return '/api/';
}

const API_BASE = getApiBase();
console.log('🔧 API_BASE:', API_BASE);

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

// ---- Универсальный fetch с таймаутом ----
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_SEARCH) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const proxyUrl = API_BASE + url.replace(/^\/+/, '');
        console.log('🔄 Запрос:', proxyUrl);
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

// ---- Поиск приложений (БЕЗ ДОПОЛНИТЕЛЬНЫХ ЗАПРОСОВ) ----
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

        console.log('📦 Ответ API:', data);

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
                const appData = {
                    appName: app.appName || 'Unknown',
                    iconUrl: app.iconUrl || '',
                    shortDescription: app.shortDescription || '',
                    packageName: app.packageName || '',
                    rating: app.averageUserRating || 0,
                    totalRatings: app.totalRatings || 0,
                    appId: app.appId,
                };
                resultsContainer.appendChild(createAppCard(appData));
            }

            state.hasMorePages = state.page < data.body.totalPages - 1;
            state.page++;
        } else {
            throw new Error('API вернул ошибку');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('❌ Ошибка поиска:', error);
            if (!isLoadMore && query === state.query) {
                ModalManager.showError('searchResults', 'Не удалось подключиться к RuStore', 'Проверьте интернет и адрес прокси.');
            }
        }
    } finally {
        if (query === state.query) state.isLoading = false;
    }
}

// ---- Создание карточки ----
function createAppCard(appData) {
    const { appName, iconUrl, shortDescription, packageName, rating, totalRatings, appId } = appData;
    const ratingStars = createRatingStars(rating);
    const ratingValue = rating.toFixed(1);

    const card = document.createElement('div');
    card.className = 'app-card p-4 flex flex-col justify-between h-full';
    card.innerHTML = `
        <div class="flex items-start gap-4">
            <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(appName)}" class="w-20 h-20 rounded-lg" onerror="this.src='https://via.placeholder.com/80'">
            <div class="flex-1 flex flex-col min-w-0">
                <h2 class="text-xl font-bold break-words">${escapeHtml(appName)}</h2>
                <p class="text-gray-600 break-words text-sm" title="${escapeHtml(packageName)}">${escapeHtml(packageName)}</p>
                <div class="rating mt-2">
                    ${ratingStars}
                    ${ratingValue}
                    <span class="text-sm text-gray-600">(${totalRatings || 0})</span>
                </div>
            </div>
        </div>
        <div class="mt-4">
            <p class="text-gray-700 text-sm">${escapeHtml(shortDescription)}</p>
        </div>
        <div class="mt-4 flex justify-between items-center">
            <button class="download-btn bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" 
                    data-appid="${appId}" 
                    data-appname="${escapeHtml(appName)}">
                Скачать APK
            </button>
            <span class="text-xs text-gray-500">RuStore</span>
        </div>
    `;

    card.querySelector('.download-btn')?.addEventListener('click', (e) => {
        const appId = parseInt(e.currentTarget.getAttribute('data-appid'));
        const appName = e.currentTarget.getAttribute('data-appname');
        downloadApp(appId, appName);
    });

    return card;
}

// ---- Скачивание APK ----
async function downloadApp(appId, appName) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4">Получение ссылки...</div>');
    const container = document.getElementById('downloadResults');
    if (!container) return;

    const suggestedFileName = `${appName.replace(/[\\/*?:"<>|]/g, '_').replace(/\s+/g, '_')}.apk`;

    try {
        const url = 'applicationData/v2/download-link';
        const response = await fetchWithTimeout(url, {
            method: 'POST',
            body: JSON.stringify({
                appId,
                firstInstall: true,
                mobileServices: [],
                supportedAbis: ['arm64-v8a', 'armeabi-v7a'],
                screenDensity: 320,
                supportedLocales: ['ru_RU'],
                sdkVersion: 29,
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
        console.error('❌ Ошибка скачивания:', error);
        container.innerHTML = `<div class="text-red-600">Ошибка: ${error.message}</div>`;
    }
}

// ---- Заглушки ----
function searchByUrl() {
    const url = document.getElementById('urlInput').value.trim();
    if (url) window.open(url, '_blank');
}
function showDescription() { alert('Описание доступно на странице RuStore.'); }
function openPreview() {}
function closeImagePreview() {}
function navigateImage() {}

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
