// ============================================================
//  RuStore через парсинг HTML (без прокси)
//  Требуется отключение CORS в браузере (расширение или флаг)
// ============================================================

// ---- Таймауты ----
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

const formatDate = date => new Date(date).toLocaleDateString();
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

// ---- Универсальный fetch с таймаутом ----
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT_SEARCH) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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

// ============================================================
//  ПОИСК (парсинг страницы поиска RuStore)
// ============================================================
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
        const url = `https://www.rustore.ru/catalog/search?q=${encodeURIComponent(query.trim())}&page=${state.page}`;
        const response = await fetchWithTimeout(url, {}, TIMEOUT_SEARCH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        if (query !== state.query) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Пытаемся найти карточки приложений (актуальные селекторы на 2026 год)
        // Проверьте вручную на странице поиска, какие классы используются.
        let items = doc.querySelectorAll('[data-testid="search-result-item"]');
        if (!items.length) items = doc.querySelectorAll('.SearchResult_item');
        if (!items.length) items = doc.querySelectorAll('.catalog-item');
        if (!items.length) items = doc.querySelectorAll('.app-card');
        if (!items.length) items = doc.querySelectorAll('.product-card');

        if (!items.length) {
            if (!isLoadMore) {
                resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Приложения не найдены</p></div>';
            }
            state.hasMorePages = false;
            return;
        }

        if (!isLoadMore) resultsContainer.innerHTML = '';

        for (const item of items) {
            if (query !== state.query) return;

            // Ссылка на страницу приложения
            const link = item.querySelector('a[href*="/app/"]');
            if (!link) continue;
            const appUrl = 'https://www.rustore.ru' + link.getAttribute('href');

            // Название
            const nameEl = item.querySelector('.app-name') || item.querySelector('h3') || item.querySelector('.title');
            const appName = nameEl ? nameEl.textContent.trim() : 'Unknown';

            // Иконка
            const iconEl = item.querySelector('img[src*="icon"]') || item.querySelector('img');
            const iconUrl = iconEl ? iconEl.getAttribute('src') : '';

            // Рейтинг
            const ratingEl = item.querySelector('.rating-value') || item.querySelector('.stars');
            let rating = 0;
            if (ratingEl) {
                const match = ratingEl.textContent.match(/(\d+(\.\d+)?)/);
                if (match) rating = parseFloat(match[0]);
            }

            // Краткое описание
            const descEl = item.querySelector('.description') || item.querySelector('.short-description');
            const shortDesc = descEl ? descEl.textContent.trim() : '';

            const appData = {
                appName,
                iconUrl,
                shortDescription: shortDesc,
                appUrl,
                rating,
                packageName: appUrl.split('/').pop() || appName
            };
            resultsContainer.appendChild(createAppCard(appData));
        }

        // Проверяем наличие следующей страницы
        const nextBtn = doc.querySelector('a[rel="next"]') || doc.querySelector('.pagination-next:not(.disabled)');
        state.hasMorePages = !!nextBtn;
        state.page++;

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(error);
            if (!isLoadMore && query === state.query) {
                let msg = 'Проверьте интернет-соединение и отключите CORS (расширение или флаг браузера).';
                ModalManager.showError('searchResults', 'Не удалось подключиться к RuStore', msg);
            }
        }
    } finally {
        if (query === state.query) state.isLoading = false;
    }
}

// ---- Создание карточки приложения ----
function createAppCard(appData) {
    const { appName, iconUrl, shortDescription, appUrl, rating, packageName } = appData;
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
                </div>
            </div>
        </div>
        <div class="mt-4">
            <p class="text-gray-700 text-sm">${escapeHtml(shortDescription)}</p>
        </div>
        <div class="mt-4 flex justify-between items-center">
            <button class="download-btn" data-appurl="${escapeHtml(appUrl)}" data-appname="${escapeHtml(appName)}">Скачать</button>
            <span class="text-xs text-gray-500">RuStore</span>
        </div>
    `;

    card.querySelector('.download-btn')?.addEventListener('click', (e) => {
        const appUrl = e.currentTarget.getAttribute('data-appurl');
        const appName = e.currentTarget.getAttribute('data-appname');
        downloadApp(appUrl, appName);
    });

    return card;
}

// ============================================================
//  СКАЧИВАНИЕ APK (парсинг страницы приложения)
// ============================================================
async function downloadApp(appUrl, appName) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4">Получение ссылки...</div>');
    const container = document.getElementById('downloadResults');
    if (!container) return;

    try {
        const response = await fetchWithTimeout(appUrl, {}, TIMEOUT_DOWNLOAD);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        let downloadLink = null;

        // 1. Ищем кнопку или ссылку с data-url или href на .apk
        const btn = doc.querySelector('[data-url*=".apk"]') || 
                    doc.querySelector('a[href*=".apk"]') ||
                    doc.querySelector('.download-button[data-url]');
        if (btn) {
            downloadLink = btn.getAttribute('data-url') || btn.getAttribute('href');
        }

        // 2. Ищем в JSON-данных внутри скриптов
        if (!downloadLink) {
            const scripts = doc.querySelectorAll('script');
            for (const script of scripts) {
                if (script.textContent.includes('"downloadUrl"')) {
                    const match = script.textContent.match(/"downloadUrl"\s*:\s*"([^"]+)"/);
                    if (match) {
                        downloadLink = match[1];
                        break;
                    }
                }
            }
        }

        // 3. Мета-теги (редко, но возможно)
        if (!downloadLink) {
            const meta = doc.querySelector('meta[property="og:video"]');
            if (meta) downloadLink = meta.getAttribute('content');
        }

        if (downloadLink && downloadLink.startsWith('/')) {
            downloadLink = 'https://www.rustore.ru' + downloadLink;
        }

        if (!downloadLink) {
            throw new Error('Не удалось найти ссылку на APK. Возможно, приложение недоступно для скачивания.');
        }

        const suggestedFileName = `${appName.replace(/[\\/*?:"<>|]/g, '_').replace(/\s+/g, '_')}.apk`;

        container.innerHTML = `
            <div class="space-y-3">
                <div class="p-3 bg-yellow-50 rounded border border-yellow-200">
                    <div class="font-semibold text-yellow-800">⚠️ Сохранение с правильным именем</div>
                    <div class="text-sm text-yellow-700 mt-1">
                        Нажмите правой кнопкой по ссылке и выберите «Сохранить ссылку как…»<br>
                        Имя файла: <strong>${escapeHtml(suggestedFileName)}</strong>
                    </div>
                </div>
                <div class="font-semibold">Ссылка для скачивания:</div>
                <div class="p-2 bg-gray-50 rounded break-all">
                    <a href="${escapeHtml(downloadLink)}" target="_blank" class="text-blue-600 underline">${escapeHtml(downloadLink)}</a>
                </div>
                <div class="mt-4 p-3 bg-gray-100 rounded">
                    <div class="font-semibold">Команды для загрузки:</div>
                    <div class="mt-2">
                        <div class="text-sm font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                            curl -L -o "${suggestedFileName}" "${escapeHtml(downloadLink)}"
                        </div>
                        <button id="copyCurlCmd" class="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">Копировать curl</button>
                    </div>
                    <div class="mt-2">
                        <div class="text-sm font-mono bg-gray-900 text-gray-100 p-2 rounded overflow-x-auto">
                            wget -O "${suggestedFileName}" "${escapeHtml(downloadLink)}"
                        </div>
                        <button id="copyWgetCmd" class="mt-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">Копировать wget</button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('copyCurlCmd')?.addEventListener('click', async () => {
            await navigator.clipboard.writeText(`curl -L -o "${suggestedFileName}" "${downloadLink}"`);
            alert('Команда curl скопирована');
        });
        document.getElementById('copyWgetCmd')?.addEventListener('click', async () => {
            await navigator.clipboard.writeText(`wget -O "${suggestedFileName}" "${downloadLink}"`);
            alert('Команда wget скопирована');
        });

    } catch (error) {
        container.innerHTML = `<div class="text-red-600">Ошибка: ${error.message}</div>`;
    }
}

// ---- Заглушки для неиспользуемых функций ----
function showDescription(appName, description) { alert('Описание доступно на странице RuStore.'); }
async function showComments(packageName, pageNumber, firstOpen) { alert('Отзывы доступны на странице RuStore.'); }
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

    // Закрытие модальных окон
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

    // Бесконечный скролл
    window.addEventListener('scroll', () => {
        if (state.isLoading || !state.hasMorePages) return;
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
            searchApps(state.query, true);
        }
    });
});
