// Android SDK version mapping
const sdkVersions = {
    1:  '1.0',   2:  '1.1',   3:  '1.5',   4:  '1.6',   5:  '2.0',  6:  '2.0.1',
    7:  '2.1',   8:  '2.2',   9:  '2.3',   10: '2.3.3', 11: '3.0',  12: '3.1',
    13: '3.2',   14: '4.0',   15: '4.0.3', 16: '4.1',   17: '4.2',  18: '4.3',
    19: '4.4',   20: '4.4W',  21: '5.0',   22: '5.1',   23: '6.0',  24: '7.0',
    25: '7.1',   26: '8.0',   27: '8.1',   28: '9.0',   29: '10',   30: '11',
    31: '12',    32: '12.1',  33: '13',    34: '14',    35: '15',   36: '16'
};

// Utility functions
const getAndroidVersion = sdk => sdkVersions[sdk] ? `Android ${sdkVersions[sdk]}` : `API ${sdk}`;

const formatFileSize = bytes => {
    if (bytes === 0) return '0 Bytes';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
};

const formatDate = date => new Date(date).toLocaleDateString();
const roundToDecimal = (num, places = 2) => Math.round(num * 10**places) / 10**places;

const escapeHtml = (value) => {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const guessAndroidScreenDensity = () => {
    const dpr = Number(window.devicePixelRatio || 1);
    let density;
    if (dpr >= 4) density = 640;
    else if (dpr >= 3) density = 480;
    else if (dpr >= 2) density = 320;
    else if (dpr >= 1.5) density = 240;
    else density = 160;
    return Math.max(240, density);
};

const createRatingStars = rating => {
    const safeRating = typeof rating === 'number' && !isNaN(rating) ? rating : 0;
    const fullStars = Math.floor(safeRating);
    const hasHalfStar = safeRating % 1 >= 0.5;
    return Array.from({length: 5}, (_, i) => 
        i < fullStars 
            ? '<span class="rating-star">★</span>' 
            : (i === fullStars && hasHalfStar) 
                ? '<span class="rating-star">⯪</span>' 
                : '<span class="text-gray-300">★</span>'
    ).join('');
};

// Modal Manager
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

// State
const state = {
    controller: null,
    imageIndex: 0,
    images: [],
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

// API functions
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
        const response = await fetch(`https://backapi.rustore.ru/applicationData/apps?pageNumber=${state.page}&pageSize=20&query=${encodeURIComponent(query.trim())}`, {
            signal: state.controller.signal
        });
        const data = await response.json();
        if (query !== state.query) return;

        if (data.code === 'OK' && data.body) {
            const results = data.body.content;
            if (!isLoadMore) resultsContainer.innerHTML = '';
            if (!results || results.length === 0) {
                if (!isLoadMore) resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Приложения не найдены</p></div>';
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
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error searching apps:', error);
            if (!isLoadMore && query === state.query) {
                ModalManager.showError('searchResults', 'Не удалось подключиться к серверу', 'Проверьте интернет-соединение');
            }
        }
    } finally {
        if (query === state.query) state.isLoading = false;
    }
}

async function fetchAppDetails(packageName, { signal } = {}) {
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/overallInfo/${packageName}`, { signal });
        const data = await response.json();
        return data.code === 'OK' && data.body ? data.body : null;
    } catch (error) {
        if (error.name !== 'AbortError') console.error('Error fetching app details:', error);
        return null;
    }
}

async function fetchAppRating(packageName) {
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/rating/${packageName}`);
        const data = await response.json();
        return data.code === 'OK' && data.body ? data.body : null;
    } catch {
        return null;
    }
}

function extractPackageNameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const appIndex = pathParts.indexOf('app');
        if (appIndex !== -1 && pathParts[appIndex + 1]) {
            return pathParts[appIndex + 1];
        }
        return null;
    } catch {
        return null;
    }
}

function createAppCard(appDetails, app) {
    const screenshots = (appDetails.fileUrls || []).sort((a, b) => a.ordinal - b.ordinal);
    const iconUrl = escapeHtml(appDetails.iconUrl || '');
    const appName = escapeHtml(appDetails.appName || '');
    const packageName = escapeHtml(appDetails.packageName || '');
    const shortDescription = escapeHtml(appDetails.shortDescription || '');
    const appId = escapeHtml(String(appDetails.appId));
    const versionCode = escapeHtml(String(appDetails.versionCode));
    const fileSize = formatFileSize(appDetails.fileSize || 0);
    const minSdk = escapeHtml(getAndroidVersion(appDetails.minSdkVersion));
    const versionName = escapeHtml(appDetails.versionName || '');
    const downloads = (appDetails.downloads || 0).toLocaleString();
    const updated = formatDate(appDetails.appVerUpdatedAt);
    const added = appDetails.appVerUpdatedAt > appDetails.firstPublishedAt 
        ? formatDate(appDetails.firstPublishedAt)
        : formatDate(appDetails.appVerUpdatedAt);
    const rating = app.averageUserRating || 0;
    const totalRatings = (app.totalRatings || 0).toLocaleString();
    const ratingStars = createRatingStars(rating);
    const ratingValue = roundToDecimal(rating);
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
            <img src="${iconUrl}" alt="${appName}" class="w-20 h-20 rounded-lg">
            <div class="flex-1 flex flex-col min-w-0">
                <h2 class="text-xl font-bold break-words">${appName}</h2>
                <p class="text-gray-600 break-words" title="${packageName}">${packageName}</p>
                <div class="rating mt-2">
                    ${ratingStars}
                    ${ratingValue}
                    <span class="text-sm text-gray-600">(${totalRatings})</span>
                </div>
                <button class="comments-toggle" data-package="${escapeHtml(appDetails.packageName)}">Показать отзывы</button>
            </div>
        </div>
        <div class="mt-4">
            <p class="text-gray-700">${shortDescription}</p>
            <button class="description-toggle mt-2" data-name="${appName}" data-desc='${descJson}'>Показать полное описание</button>
        </div>
        <div class="screenshots-container my-4">${screenshotsHtml}</div>
        <div class="grid grid-cols-2 gap-2 text-sm text-gray-600">
            <div>App ID: ${appId}</div>
            <div>Version Code: ${versionCode}</div>
            <div>Size: ~${fileSize}</div>
            <div>Min SDK: ${minSdk}</div>
            <div>Version: ${versionName}</div>
            <div>Downloads: ${downloads}</div>
            <div>Updated: ${updated}</div>
            <div>Added: ${added}</div>
        </div>
        <div class="mt-4 flex justify-between items-center">
            <button class="download-btn" data-appid="${appDetails.appId}" data-sdk="${appDetails.minSdkVersion}">Скачать</button>
            <span class="version-history-btn" data-appid="${appDetails.appId}">История версий</span>
        </div>
    `;

    card.querySelector('.comments-toggle')?.addEventListener('click', (e) => {
        const pkg = e.currentTarget.getAttribute('data-package');
        showComments(pkg, 0, true);
    });
    card.querySelector('.description-toggle')?.addEventListener('click', (e) => {
        const name = e.currentTarget.getAttribute('data-name');
        const desc = e.currentTarget.getAttribute('data-desc');
        showDescription(name, desc);
    });
    card.querySelector('.download-btn')?.addEventListener('click', (e) => {
        const appId = parseInt(e.currentTarget.getAttribute('data-appid'));
        const sdk = parseInt(e.currentTarget.getAttribute('data-sdk'));
        downloadApp(appId, sdk);
    });
    card.querySelector('.version-history-btn')?.addEventListener('click', (e) => {
        const appId = parseInt(e.currentTarget.getAttribute('data-appid'));
        showVersionHistory(appId);
    });

    return card;
}

async function showVersionHistory(appId) {
    ModalManager.show('versionModal', 'versionHistory', '<div class="text-center p-4"><p class="text-gray-600">Загрузка истории версий...</p></div>');
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/allAppVersionWhatsNew/${appId}`);
        const data = await response.json();
        if (data.code === 'OK' && data.body) {
            const versions = data.body.content;
            const container = document.getElementById('versionHistory');
            if (container) {
                if (versions?.length) {
                    container.innerHTML = versions.map(v => `
                        <div class="border-b pb-4">
                            <div class="font-bold">Версия ${escapeHtml(v.versionName)}</div>
                            <div class="text-sm text-gray-600">${formatDate(v.appVerUpdatedAt)}</div>
                            <div class="mt-2">${escapeHtml(v.whatsNew)}</div>
                        </div>
                    `).join('');
                } else {
                    container.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Нет данных об истории версий</p></div>';
                }
            }
        } else {
            ModalManager.showError('versionHistory', 'Ошибка', 'Не удалось загрузить историю версий');
        }
    } catch (error) {
        ModalManager.showError('versionHistory', 'Ошибка', 'Проверьте соединение');
    }
}

async function downloadApp(appId, sdkVersion, options = {}) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4"><p class="text-gray-600">Получение ссылки...</p></div>');

    const openDownload = (url) => {
        const w = window.open(url, '_blank', 'noopener,noreferrer');
        if (!w) window.location.href = url;
    };

    const requestDownloadLink = async (withoutSplits, screenDensity) => {
        const response = await fetch('https://backapi.rustore.ru/applicationData/v2/download-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId,
                firstInstall: true,
                mobileServices: [],
                supportedAbis: ['x86_64', 'arm64-v8a', 'x86', 'armeabi-v7a', 'armeabi'],
                screenDensity,
                supportedLocales: ['ru_RU'],
                sdkVersion,
                withoutSplits,
                signatureFingerprint: null
            })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    };

    const renderDownloadLinks = (data, { screenDensity, withoutSplitsUsed }) => {
        const container = document.getElementById('downloadResults');
        if (!container) return;
        const urls = data?.body?.downloadUrls || [];
        const allLinks = urls.map(u => u.url).filter(Boolean);
        const firstLink = allLinks[0];
        const isSplitSet = allLinks.length > 1;

        // Build plan for scripts
        const buildPlan = () => {
            const versionCode = data?.body?.versionCode ?? 'unknown';
            const items = urls.map((u, idx) => ({ idx, url: u?.url, size: u?.size, hash: u?.hash })).filter(i => i.url);
            const sorted = [...items].sort((a, b) => (b.size || 0) - (a.size || 0));
            const baseIdx = sorted[0]?.idx;
            let configCounter = 1;
            return items.map(i => {
                const safeHash = (i.hash || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
                const filename = i.idx === baseIdx
                    ? `rustore_${appId}_${versionCode}_base${safeHash ? '_' + safeHash : ''}.apk`
                    : `rustore_${appId}_${versionCode}_config${configCounter++}${safeHash ? '_' + safeHash : ''}.apk`;
                return { ...i, filename };
            });
        };
        const plan = buildPlan();

        container.innerHTML = `
            <div class="space-y-3">
                <div class="p-3 bg-gray-50 rounded-lg">
                    <div class="text-sm"><strong>Использовано:</strong> screenDensity=${screenDensity}, withoutSplits=${withoutSplitsUsed}</div>
                    ${isSplitSet ? '<div class="mt-1 text-sm">⚠️ Split APK – нужно скачать все файлы.</div>' : ''}
                    <div class="mt-2">
                        <select id="screenDensitySelect" class="border rounded px-2 py-1">
                            ${[160,240,320,480,640,0].map(d => `<option value="${d}" ${d===screenDensity?'selected':''}>${d===0?'0 (авто)':d}</option>`).join('')}
                        </select>
                        <button id="retryDownload" class="ml-2 bg-blue-500 text-white px-3 py-1 rounded">Повторить</button>
                    </div>
                </div>
                <div class="text-sm">
                    <div><strong>App ID:</strong> ${escapeHtml(data?.body?.appId)}</div>
                    <div><strong>Version Code:</strong> ${escapeHtml(data?.body?.versionCode)}</div>
                </div>
                ${firstLink ? `
                <div class="p-3 bg-green-50 rounded-lg">
                    <div class="font-semibold">Прямая ссылка</div>
                    <a href="${escapeHtml(firstLink)}" target="_blank" class="text-blue-600 break-all">${escapeHtml(firstLink)}</a>
                    <div class="mt-2 flex gap-2 flex-wrap">
                        <button id="startPrimaryDownload" class="bg-blue-600 text-white px-3 py-1 rounded">Скачать</button>
                        <button id="copyDownloadLinks" class="border px-3 py-1 rounded">Копировать ссылки</button>
                        <button id="copyPwshScript" class="border px-3 py-1 rounded">PowerShell</button>
                        <button id="copyCurlCommands" class="border px-3 py-1 rounded">curl</button>
                        ${isSplitSet ? '<button id="copyAdbInstall" class="border px-3 py-1 rounded">adb команда</button>' : ''}
                    </div>
                </div>
                ` : ''}
                ${urls.length ? `
                <div class="border-t pt-3">
                    <div class="font-semibold mb-2">Файлы</div>
                    ${urls.map((u, idx) => `<div class="p-2 bg-gray-50 rounded mb-2 break-all"><a href="${escapeHtml(u.url)}" target="_blank">${escapeHtml(u.url)}</a><button class="download-file ml-2 text-sm" data-url="${escapeHtml(u.url)}">📥</button></div>`).join('')}
                </div>
                ` : ''}
                <details class="text-xs"><summary>JSON</summary><pre class="bg-gray-900 text-gray-100 p-2 rounded overflow-auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre></details>
            </div>
        `;

        // Event handlers
        document.getElementById('startPrimaryDownload')?.addEventListener('click', () => openDownload(firstLink));
        document.querySelectorAll('.download-file').forEach(btn => {
            btn.addEventListener('click', () => openDownload(btn.dataset.url));
        });
        document.getElementById('copyDownloadLinks')?.addEventListener('click', async () => {
            await navigator.clipboard.writeText(allLinks.join('\n'));
            alert('Ссылки скопированы');
        });
        document.getElementById('copyPwshScript')?.addEventListener('click', async () => {
            const lines = plan.map(p => `Invoke-WebRequest -Uri '${p.url.replace(/'/g, "''")}' -OutFile "downloads/${p.filename}"`);
            await navigator.clipboard.writeText(lines.join('\n'));
            alert('PowerShell скрипт скопирован');
        });
        document.getElementById('copyCurlCommands')?.addEventListener('click', async () => {
            const lines = plan.map(p => `curl -L "${p.url.replace(/"/g, '\\"')}" -o "downloads/${p.filename}"`);
            await navigator.clipboard.writeText(lines.join('\n'));
            alert('curl команды скопированы');
        });
        document.getElementById('copyAdbInstall')?.addEventListener('click', async () => {
            await navigator.clipboard.writeText('adb install-multiple downloads/*.apk');
            alert('adb команда скопирована');
        });
        document.getElementById('retryDownload')?.addEventListener('click', () => {
            const density = parseInt(document.getElementById('screenDensitySelect').value);
            downloadApp(appId, sdkVersion, { screenDensity: density });
        });
    };

    try {
        const requestedDensity = options.screenDensity ?? guessAndroidScreenDensity();
        const densities = [...new Set([requestedDensity, 480, 320, 240, 160, 0])];
        for (const density of densities) {
            for (const withoutSplits of [false, true]) {
                const data = await requestDownloadLink(withoutSplits, density);
                if (data?.code !== 'OK') throw new Error(data?.message);
                if (data?.body?.downloadUrls?.length) {
                    renderDownloadLinks(data, { screenDensity: density, withoutSplitsUsed: withoutSplits });
                    return;
                }
            }
        }
        ModalManager.showError('downloadResults', 'Нет ссылок', 'Попробуйте другую плотность экрана');
    } catch (error) {
        ModalManager.showError('downloadResults', 'Ошибка', error.message);
    }
}

function showDescription(appName, description) {
    const modal = document.getElementById('descriptionModal');
    const content = document.getElementById('descriptionContent');
    if (!modal || !content) return;
    modal.querySelector('h2').textContent = `${appName} — Описание`;
    content.textContent = description;
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

async function showComments(packageName, pageNumber, firstOpen) {
    const modal = document.getElementById('commentsModal');
    const header = document.getElementById('appCommentsHeader');
    const filterSelect = document.getElementById('commentsFilterOption');
    const body = document.getElementById('appCommentsBody');
    if (!modal || !header || !filterSelect || !body) return;

    if (firstOpen) {
        header.innerHTML = 'Отзывы о приложении';
        filterSelect.innerHTML = `
            <option value="NEW_FIRST">Сначала новые</option>
            <option value="USEFUL_FIRST">Сначала полезные</option>
            <option value="POSITIVE_FIRST">Сначала положительные</option>
            <option value="NEGATIVE_FIRST">Сначала отрицательные</option>
        `;
        filterSelect.value = 'NEW_FIRST';
        filterSelect.classList.remove('hidden');
        ModalManager.show('commentsModal');
        modal.dataset.pageCount = '0';
        modal.dataset.allCommentsLoaded = 'false';
        modal.dataset.canLoad = 'true';
        modal.dataset.packageName = packageName;
    }

    if (pageNumber === 0) body.innerHTML = '<div class="text-center p-4">Загрузка отзывов...</div>';

    try {
        const filter = filterSelect.value;
        const resp = await fetch(`https://backapi.rustore.ru/comment/comment?packageName=${packageName}&sortBy=${filter}&pageNumber=${pageNumber}&pageSize=20`);
        const data = await resp.json();
        if (data.code === 'OK' && data.body) {
            const comments = data.body.content || [];
            const html = comments.map(c => `
                <div class="p-4 bg-gray-100 rounded-xl">
                    <div class="font-semibold">${escapeHtml(c.firstName)}</div>
                    <div class="rating">${createRatingStars(c.appRating)}</div>
                    <div class="text-sm text-gray-600">${formatDate(c.commentDate)}</div>
                    <div class="mt-2">${escapeHtml(c.commentText)}</div>
                    <div class="mt-2"><span class="text-green-600">👍 ${c.likeCounter}</span> | <span class="text-red-600">👎 ${c.dislikeCounter}</span></div>
                    ${c.devResponse ? `<div class="mt-2 italic text-gray-700">Ответ разработчика: ${escapeHtml(c.devResponse)}</div>` : ''}
                </div>
            `).join('');
            if (pageNumber === 0) body.innerHTML = html || '<div class="text-center p-4">Нет отзывов</div>';
            else body.insertAdjacentHTML('beforeend', html);
            modal.dataset.allCommentsLoaded = (comments.length < 20).toString();
            modal.dataset.canLoad = 'true';
            modal.dataset.pageCount = pageNumber;
        } else {
            ModalManager.showError('appCommentsBody', 'Ошибка', 'Не удалось загрузить отзывы');
        }
    } catch (error) {
        ModalManager.showError('appCommentsBody', 'Ошибка', 'Проверьте соединение');
    }
}

// Image preview
function openPreview(imageUrl, event) {
    const modal = document.getElementById('imagePreviewModal');
    const card = event.target.closest('.app-card');
    if (!card) return;
    const imgs = Array.from(card.querySelectorAll('.screenshots-container img'));
    state.images = imgs.map(img => img.src);
    state.imageIndex = state.images.indexOf(imageUrl);
    document.getElementById('previewImage').src = imageUrl;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    updateNavButtons();
}

function updateNavButtons() {
    const prev = document.getElementById('prevImage');
    const next = document.getElementById('nextImage');
    const prog = document.getElementById('imageProgress');
    if (prev) prev.style.display = state.imageIndex > 0 ? 'block' : 'none';
    if (next) next.style.display = state.imageIndex < state.images.length - 1 ? 'block' : 'none';
    if (prog) prog.textContent = `${state.imageIndex+1} / ${state.images.length}`;
}

function navigateImage(dir) {
    if (dir === 'prev' && state.imageIndex > 0) state.imageIndex--;
    else if (dir === 'next' && state.imageIndex < state.images.length - 1) state.imageIndex++;
    document.getElementById('previewImage').src = state.images[state.imageIndex];
    updateNavButtons();
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    modal.classList.add('hidden');
    modal.classList.remove('show');
    state.images = [];
    state.imageIndex = 0;
}

// Search by URL
async function searchByUrl() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) return;
    const packageName = extractPackageNameFromUrl(url);
    if (!packageName) {
        alert('Не удалось извлечь идентификатор приложения из ссылки. Пример: https://www.rustore.ru/catalog/app/com.example.app');
        return;
    }
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Загрузка...</p></div>';
    try {
        const appDetails = await fetchAppDetails(packageName);
        if (appDetails) {
            const rating = await fetchAppRating(packageName);
            const app = {
                averageUserRating: rating?.averageUserRating || 0,
                totalRatings: rating?.totalRatings || 0,
                packageName: packageName
            };
            resultsContainer.innerHTML = '';
            resultsContainer.appendChild(createAppCard(appDetails, app));
        } else {
            resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Приложение не найдено</p></div>';
        }
    } catch (error) {
        resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-red-600">Ошибка загрузки</p></div>';
    }
}

// DOM ready
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

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal?.id === 'imagePreviewModal') closeImagePreview();
            else ModalManager.hide(modal?.id, modal?.querySelector('[id]')?.id);
        });
    });
    document.getElementById('prevImage')?.addEventListener('click', () => navigateImage('prev'));
    document.getElementById('nextImage')?.addEventListener('click', () => navigateImage('next'));
    document.addEventListener('keydown', e => {
        const modal = document.getElementById('imagePreviewModal');
        if (modal?.classList.contains('show')) {
            if (e.key === 'ArrowLeft') navigateImage('prev');
            else if (e.key === 'ArrowRight') navigateImage('next');
            else if (e.key === 'Escape') closeImagePreview();
        }
    });
    window.onclick = e => {
        if (e.target.classList?.contains('modal')) {
            if (e.target.id === 'imagePreviewModal') closeImagePreview();
            else ModalManager.hide(e.target.id, e.target.querySelector('[id]')?.id);
        }
    };

    // Infinite scroll
    window.addEventListener('scroll', () => {
        if (state.isLoading || !state.hasMorePages) return;
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200) {
            searchApps(state.query, true);
        }
    });
});
