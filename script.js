// Android SDK version mapping
const sdkVersions = {
    1:  '1.0',   2:  '1.1',   3:  '1.5',   4:  '1.6',   5:  '2.0',  6:  '2.0.1',
    7:  '2.1',   8:  '2.2',   9:  '2.3',   10: '2.3.3', 11: '3.0',  12: '3.1',
    13: '3.2',   14: '4.0',   15: '4.0.3', 16: '4.1',   17: '4.2',  18: '4.3',
    19: '4.4',   20: '4.4W',  21: '5.0',   22: '5.1',   23: '6.0',  24: '7.0',
    25: '7.1',   26: '8.0',   27: '8.1',   28: '9.0',   29: '10',   30: '11',
    31: '12',    32: '12.1',  33: '13',    34: '14',    35: '15',   36: '16'
}; // https://en.wikipedia.org/wiki/Android_version_history

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
    // Android density buckets (dpi): 160 mdpi, 240 hdpi, 320 xhdpi, 480 xxhdpi, 640 xxxhdpi.
    // Some RuStore apps return empty downloadUrls for low/zero densities, so we clamp to >= 240.
    const dpr = Number(window.devicePixelRatio || 1);
    let density;
    if (dpr >= 4) density = 640;
    else if (dpr >= 3) density = 480;
    else if (dpr >= 2) density = 320;
    else if (dpr >= 1.5) density = 240;
    else density = 160;
    return Math.max(240, density);
};

const basenameFromUrl = (url) => {
    try {
        const u = new URL(url);
        const name = u.pathname.split('/').filter(Boolean).pop() || 'file.apk';
        return name;
    } catch {
        return 'file.apk';
    }
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

// Modal Management
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

// State Management
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
            // Unexpected response
            if (!isLoadMore && query === state.query) {
                resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Ошибка получения данных</p></div>';
            }
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error searching apps:', error);
            if (!isLoadMore && query === state.query) {
                ModalManager.showError('searchResults', 'Не удалось подключиться к серверу', 'Проверьте интернет-соединение и повторите попытку');
            }
        }
    } finally {
        if (query === state.query) {
            state.isLoading = false;
        }
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

// UI functions
function createAppCard(appDetails, app) {
    const screenshots = (appDetails.fileUrls || []).sort((a, b) => a.ordinal - b.ordinal);
    
    // Build HTML safely
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
    
    // Prepare description for onclick (JSON string)
    const fullDescription = appDetails.fullDescription || '';
    const descJson = JSON.stringify(fullDescription);
    
    // Build screenshots HTML
    let screenshotsHtml = '';
    for (const s of screenshots) {
        const src = escapeHtml(s.fileUrl);
        screenshotsHtml += `<img src="${src}" alt="Screenshot" class="w-40 cursor-pointer rounded shadow" onclick="openPreview('${src}', event)">`;
    }
    
    // Build the card using innerHTML with escaped data
    const card = document.createElement('div');
    card.className = 'app-card p-4 flex flex-col justify-between h-full';
    card.innerHTML = `
        <div class="flex items-start gap-4">
            <img src="${iconUrl}" alt="${appName}" class="w-20 h-20 rounded-lg">
            <div class="flex-1 flex flex-col min-w-0">
                <h2 class="text-xl font-bold break-words whitespace-normal w-full">${appName}</h2>
                <p class="text-gray-600 break-words whitespace-normal max-w-full" title="${packageName}">${packageName}</p>
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
        
        <div class="screenshots-container my-4">
            ${screenshotsHtml}
        </div>
        
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
    
    // Attach event listeners using delegation or direct binding
    const commentsBtn = card.querySelector('.comments-toggle');
    if (commentsBtn) {
        commentsBtn.onclick = () => showComments(commentsBtn.getAttribute('data-package'), 0, true);
    }
    const descBtn = card.querySelector('.description-toggle');
    if (descBtn) {
        descBtn.onclick = () => {
            const name = descBtn.getAttribute('data-name');
            const desc = descBtn.getAttribute('data-desc');
            showDescription(name, desc);
        };
    }
    const downloadBtn = card.querySelector('.download-btn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const appId = downloadBtn.getAttribute('data-appid');
            const sdk = downloadBtn.getAttribute('data-sdk');
            downloadApp(parseInt(appId), parseInt(sdk));
        };
    }
    const versionBtn = card.querySelector('.version-history-btn');
    if (versionBtn) {
        versionBtn.onclick = () => showVersionHistory(parseInt(versionBtn.getAttribute('data-appid')));
    }
    
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
            if (!container) return;
            if (versions && versions.length) {
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
        } else {
            ModalManager.showError('versionHistory', 'Не удалось загрузить историю версий', 'Попробуйте позже');
        }
    } catch (error) {
        console.error('Error fetching version history:', error);
        ModalManager.showError('versionHistory', 'Не удалось загрузить историю версий', 'Попробуйте позже');
    }
}

async function downloadApp(appId, sdkVersion, options = {}) {
    ModalManager.show('downloadModal', 'downloadResults', '<div class="text-center p-4"><p class="text-gray-600">Получение ссылки для скачивания...</p></div>');

    const openDownload = (url) => {
        const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
        if (!newWindow) {
            window.location.href = url;
        }
    };

    const requestDownloadLink = async (withoutSplits, screenDensity) => {
        const response = await fetch('https://backapi.rustore.ru/applicationData/v2/download-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appId,
                firstInstall: true,
                mobileServices: [],
                supportedAbis: [
                    'x86_64',
                    'arm64-v8a',
                    'x86',
                    'armeabi-v7a',
                    'armeabi'
                ],
                screenDensity,
                supportedLocales: ['ru_RU'],
                sdkVersion,
                withoutSplits,
                signatureFingerprint: null
            })
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errBody.message || 'Unknown error'}`);
        }
        return response.json();
    };

    const renderDownloadLinks = (data, { screenDensity, withoutSplitsUsed }) => {
        const container = document.getElementById('downloadResults');
        if (!container) return;
        const urls = data?.body?.downloadUrls || [];
        const signature = data?.body?.signature || '';

        const allLinks = urls.map(u => u.url).filter(Boolean);
        const firstLink = allLinks[0];
        const isSplitSet = allLinks.length > 1;

        const buildDownloadPlan = () => {
            const versionCode = data?.body?.versionCode ?? 'unknown';
            const items = urls
                .map((u, idx) => ({
                    idx,
                    url: u?.url,
                    size: typeof u?.size === 'number' ? u.size : null,
                    hash: u?.hash ? String(u.hash) : null
                }))
                .filter(i => !!i.url);

            const sortedBySize = [...items].sort((a, b) => (b.size || 0) - (a.size || 0));
            const baseIdx = sortedBySize[0]?.idx;
            let configCounter = 1;

            return items.map(i => {
                const safeHash = (i.hash || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
                if (i.idx === baseIdx) {
                    return {
                        ...i,
                        role: 'base',
                        filename: `rustore_${appId}_${versionCode}_base${safeHash ? '_' + safeHash : ''}.apk`
                    };
                }
                const n = configCounter++;
                return {
                    ...i,
                    role: 'config',
                    filename: `rustore_${appId}_${versionCode}_config${n}${safeHash ? '_' + safeHash : ''}.apk`
                };
            });
        };

        const plan = buildDownloadPlan();

        const copyLinksButton = allLinks.length
            ? `<button class="download-btn" id="copyDownloadLinks">Скопировать ссылки</button>`
            : '';

        const copyPowerShellButton = allLinks.length
            ? `<button class="download-btn" id="copyPwshScript">Скопировать PowerShell скрипт</button>`
            : '';

        const copyCurlButton = allLinks.length
            ? `<button class="download-btn" id="copyCurlCommands">Скопировать curl команды</button>`
            : '';

        const copyAdbButton = isSplitSet
            ? `<button class="download-btn" id="copyAdbInstall">Скопировать adb команду</button>`
            : '';

        const densityOptions = [160, 240, 320, 480, 640, 0];
        const densitySelect = `
            <label class="text-sm text-gray-700">Плотность экрана (dpi)</label>
            <select id="screenDensitySelect" class="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-2 py-1 ml-2">
                ${densityOptions.map(d => `<option value="${d}" ${Number(d) === Number(screenDensity) ? 'selected' : ''}>${d === 0 ? '0 (авто/неизвестно)' : d}</option>`).join('')}
            </select>
            <button class="download-btn ml-2" id="retryDownload">Повторить</button>
        `;

        container.innerHTML = `
            <div class="space-y-3">
                <div class="p-3 bg-gray-50 rounded-lg">
                    <div class="text-sm text-gray-700">
                        <div><span class="font-semibold">Использовано:</span> screenDensity=${escapeHtml(screenDensity)} • withoutSplits=${escapeHtml(withoutSplitsUsed)}</div>
                        ${isSplitSet ? '<div class="mt-1 text-sm text-gray-600">Приложение поставляется как набор split APK (несколько файлов). Скачайте все части для установки.</div>' : ''}
                    </div>
                    <div class="mt-2">${densitySelect}</div>
                </div>

                <div class="text-sm text-gray-700">
                    <div><span class="font-semibold">App ID:</span> ${escapeHtml(data?.body?.appId)}</div>
                    <div><span class="font-semibold">Version Code:</span> ${escapeHtml(data?.body?.versionCode)}</div>
                    <div><span class="font-semibold">Version ID:</span> ${escapeHtml(data?.body?.versionId)}</div>
                    ${signature ? `<div class="break-all"><span class="font-semibold">Signature:</span> ${escapeHtml(signature)}</div>` : ''}
                </div>

                ${firstLink ? `
                    <div class="p-3 bg-green-50 rounded-lg">
                        <div class="text-green-700 font-semibold mb-2">Прямая ссылка на скачивание</div>
                        <a href="${escapeHtml(firstLink)}" class="text-blue-600 underline break-all" rel="noopener noreferrer" target="_blank">${escapeHtml(firstLink)}</a>
                        <div class="mt-3 flex gap-2 flex-wrap">
                            <button class="download-btn" id="startPrimaryDownload">Скачать</button>
                            ${copyLinksButton}
                            ${copyPowerShellButton}
                            ${copyCurlButton}
                            ${copyAdbButton}
                        </div>
                        <div class="text-xs text-gray-600 mt-2">Если браузер блокирует автозагрузку, используйте ссылку выше.</div>
                    </div>
                ` : ''}

                ${urls.length ? `
                    <div class="border-t pt-3">
                        <div class="font-semibold text-gray-800 mb-2">Файлы</div>
                        <div class="space-y-2">
                            ${urls.map((u, idx) => {
                                const url = u?.url || '';
                                const size = typeof u?.size === 'number' ? formatFileSize(u.size) : '';
                                const hash = u?.hash ? String(u.hash) : '';
                                return `
                                    <div class="p-3 bg-gray-50 rounded-lg">
                                        <div class="text-sm text-gray-700 mb-1">#${idx + 1}${size ? ` • ${escapeHtml(size)}` : ''}${hash ? ` • hash: <span class="font-mono">${escapeHtml(hash)}</span>` : ''}</div>
                                        <a href="${escapeHtml(url)}" class="text-blue-600 underline break-all" rel="noopener noreferrer" target="_blank">${escapeHtml(url)}</a>
                                        <div class="mt-2">
                                            <button class="download-btn" data-download-url="${escapeHtml(url)}">Скачать этот файл</button>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}

                ${isSplitSet ? `
                    <div class="border-t pt-3">
                        <div class="font-semibold text-gray-800 mb-2">Как установить (split APK)</div>
                        <div class="text-sm text-gray-700 space-y-2">
                            <div><span class="font-semibold">На Android:</span> используйте установщик split APK (например, SAI / APKMirror Installer) и выберите все скачанные APK файлы.</div>
                            <div><span class="font-semibold">На ПК (ADB):</span> скачайте все APK в одну папку, затем выполните <span class="font-mono">adb install-multiple</span> со всеми файлами.</div>
                            <div class="text-xs text-gray-600">Подсказка: базовый APK обычно самый большой файл. Порядок не важен, если передаёте все файлы сразу.</div>
                        </div>
                    </div>
                ` : ''}

                <details class="border-t pt-3">
                    <summary class="cursor-pointer text-sm text-gray-600">Отладка JSON</summary>
                    <pre class="mt-2 whitespace-pre-wrap text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
                </details>
            </div>
        `;

        // Wire up actions
        if (firstLink) {
            const btn = document.getElementById('startPrimaryDownload');
            if (btn) {
                btn.onclick = () => openDownload(firstLink);
            }
        }

        container.querySelectorAll('button[data-download-url]').forEach((button) => {
            button.onclick = () => {
                const url = button.getAttribute('data-download-url');
                if (url) openDownload(url);
            };
        });

        const copyBtn = document.getElementById('copyDownloadLinks');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(allLinks.join('\n'));
                    copyBtn.textContent = 'Скопировано';
                    setTimeout(() => (copyBtn.textContent = 'Скопировать ссылки'), 1200);
                } catch {
                    window.prompt('Скопируйте ссылки:', allLinks.join('\n'));
                }
            };
        }

        const toClipboard = async (text, button) => {
            try {
                await navigator.clipboard.writeText(text);
                if (button) {
                    const old = button.textContent;
                    button.textContent = 'Скопировано';
                    setTimeout(() => (button.textContent = old), 1200);
                }
            } catch {
                window.prompt('Скопируйте:', text);
            }
        };

        const pwshBtn = document.getElementById('copyPwshScript');
        if (pwshBtn) {
            pwshBtn.onclick = () => {
                const lines = [];
                lines.push('$ErrorActionPreference = "Stop"');
                lines.push('$outDir = Join-Path $PWD "downloads"');
                lines.push('New-Item -ItemType Directory -Force -Path $outDir | Out-Null');
                for (const item of plan) {
                    // Escape single quotes in URL for PowerShell
                    const escapedUrl = item.url.replace(/'/g, "''");
                    lines.push(`Invoke-WebRequest -Uri '${escapedUrl}' -OutFile (Join-Path $outDir "${item.filename}")`);
                }
                lines.push('Write-Host "Готово. Файлы сохранены в" $outDir');
                if (isSplitSet) {
                    lines.push('');
                    lines.push('# Установка (требуется adb в PATH и включённая отладка по USB)');
                    lines.push('$apks = Get-ChildItem -Path $outDir -Filter "*.apk" | Sort-Object Length -Descending | Select-Object -ExpandProperty FullName');
                    lines.push('Write-Host "Выполняется: adb install-multiple <все apk>"');
                    lines.push('adb install-multiple @apks');
                }
                toClipboard(lines.join('\n'), pwshBtn);
            };
        }

        const curlBtn = document.getElementById('copyCurlCommands');
        if (curlBtn) {
            curlBtn.onclick = () => {
                const lines = [];
                lines.push('mkdir -p downloads');
                for (const item of plan) {
                    // Escape double quotes in URL for curl
                    const escapedUrl = item.url.replace(/"/g, '\\"');
                    lines.push(`curl -L "${escapedUrl}" -o "downloads/${item.filename}"`);
                }
                if (isSplitSet) {
                    lines.push('');
                    lines.push('# Установка (требуется adb)');
                    lines.push('adb install-multiple downloads/*.apk');
                }
                toClipboard(lines.join('\n'), curlBtn);
            };
        }

        const adbBtn = document.getElementById('copyAdbInstall');
        if (adbBtn) {
            adbBtn.onclick = () => {
                const lines = [];
                lines.push('# PowerShell (Windows)');
                lines.push('$apks = Get-ChildItem -Path .\downloads -Filter "*.apk" | Sort-Object Length -Descending | Select-Object -ExpandProperty FullName');
                lines.push('adb install-multiple @apks');
                lines.push('');
                lines.push('# Bash (macOS/Linux)');
                lines.push('adb install-multiple downloads/*.apk');
                toClipboard(lines.join('\n'), adbBtn);
            };
        }

        const retryBtn = document.getElementById('retryDownload');
        if (retryBtn) {
            retryBtn.onclick = () => {
                const select = document.getElementById('screenDensitySelect');
                const density = select ? Number(select.value) : screenDensity;
                downloadApp(appId, sdkVersion, { screenDensity: density });
            };
        }
    };

    try {
        const requestedDensity = Number.isFinite(options.screenDensity)
            ? Number(options.screenDensity)
            : guessAndroidScreenDensity();

        const densityCandidates = Array.from(new Set([
            requestedDensity,
            480,
            320,
            240,
            160,
            0
        ].map(Number)));

        const withoutSplitsCandidates = [false, true];
        let lastData = null;
        let lastMeta = { screenDensity: requestedDensity, withoutSplitsUsed: false };

        for (const density of densityCandidates) {
            for (const withoutSplits of withoutSplitsCandidates) {
                const data = await requestDownloadLink(withoutSplits, density);
                if (data?.code !== 'OK') {
                    throw new Error(data?.message || 'Server returned error');
                }
                lastData = data;
                lastMeta = { screenDensity: density, withoutSplitsUsed: withoutSplits };

                const urls = data?.body?.downloadUrls || [];
                if (Array.isArray(urls) && urls.length > 0) {
                    renderDownloadLinks(data, lastMeta);
                    return;
                }
            }
        }

        // If we get here, all attempts returned empty URL lists.
        const container = document.getElementById('downloadResults');
        if (container) {
            container.innerHTML = `
                <div class="p-4 bg-yellow-50 rounded-lg">
                    <div class="font-semibold text-yellow-800">Нет доступных ссылок для скачивания</div>
                    <div class="text-sm text-yellow-700 mt-2">API RuStore вернул OK, но список URL пуст для всех проверенных параметров. Возможно, это ограничение магазина для данного приложения или неподдерживаемый профиль устройства.</div>
                    <div class="text-sm text-yellow-700 mt-2">Совет: попробуйте вручную выбрать плотность экрана (240/320/480) и повторите.</div>
                    <details class="mt-3">
                        <summary class="cursor-pointer text-sm text-yellow-800">Отладка JSON</summary>
                        <pre class="mt-2 whitespace-pre-wrap text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto">${escapeHtml(JSON.stringify(lastData, null, 2))}</pre>
                    </details>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error downloading app:', error);
        ModalManager.showError('downloadResults', 'Не удалось получить ссылки для скачивания', error?.message ? String(error.message) : 'Попробуйте позже');
    }
}

function showDescription(appName, description) {
    const modal = document.getElementById('descriptionModal');
    const content = document.getElementById('descriptionContent');
    if (!modal || !content) return;
    
    // Set the app name as the modal title
    const titleEl = modal.querySelector('h2');
    if (titleEl) titleEl.textContent = `${appName} — Описание`;
    
    // Set the description content (safe, using textContent)
    content.textContent = description;
    
    // Show the modal
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
        header.innerHTML = `Отзывы о приложении`;
        // Устанавливаем фильтр по умолчанию и показываем select
        filterSelect.innerHTML = `
            <option value="NEW_FIRST">Сначала новые</option>
            <option value="USEFUL_FIRST">Сначала полезные</option>
            <option value="POSITIVE_FIRST">Сначала положительные</option>
            <option value="NEGATIVE_FIRST">Сначала отрицательные</option>
        `;
        filterSelect.value = 'NEW_FIRST';
        filterSelect.classList.remove('hidden');
        ModalManager.show('commentsModal');
        // Инициализируем dataset
        modal.dataset.pageCount = '0';
        modal.dataset.allCommentsLoaded = 'false';
        modal.dataset.canLoad = 'true';
        modal.dataset.packageName = packageName;
    }

    if (pageNumber == 0) {
        body.innerHTML = '<div class="text-center p-4"><p class="text-gray-600">Загрузка отзывов...</p></div>';
    }

    try {
        const filterOption = filterSelect.value;
        const response = await fetch(`https://backapi.rustore.ru/comment/comment?packageName=${packageName}&sortBy=${filterOption}&pageNumber=${pageNumber}&pageSize=20`);
        const data = await response.json();
        
        if (data.code === 'OK' && data.body) {
            const comments = data.body.content || [];
            const commentsHtml = comments.length ? 
                comments.map(c => {
                    const devAnswer = c.devResponse ? `
                        <div class="mt-4 font-semibold">Ответ разработчика</div>
                        <div class="text-sm text-gray-600">${formatDate(c.devResponseDate)}</div>
                        <div class="mt-2">${escapeHtml(c.devResponse)}</div>
                    ` : "";
                    return `<div class="p-4 bg-gray-100 rounded-xl">
                                <div class="font-semibold">${escapeHtml(c.firstName)}</div>
                                <div class="rating">
                                    ${createRatingStars(c.appRating)}
                                </div>
                                <div class="text-sm text-gray-600">${formatDate(c.commentDate)}</div>
                                <div class="mt-2">${escapeHtml(c.commentText)}</div>
                                <div class="mt-4"><span class="font-bold text-green-600">${c.likeCounter}</span> | <span class="font-bold text-red-600">${c.dislikeCounter}</span></div>
                                ${devAnswer}
                            </div>`;
                }).join('') : 
                '<div class="text-center p-4"><p class="text-gray-600">Нет отзывов</p></div>';
            
            if (pageNumber > 0) {
                body.innerHTML += commentsHtml;
            } else {
                body.innerHTML = commentsHtml;
            }

            modal.dataset.pageCount = pageNumber;
            modal.dataset.allCommentsLoaded = comments.length < 20 ? 'true' : 'false';
            modal.dataset.canLoad = 'true';
        } else {
            ModalManager.showError('appCommentsBody', 'Не удалось загрузить отзывы', 'Попробуйте позже');
        }
    } catch (error) {
        console.error('Error fetching comments:', error);
        ModalManager.showError('appCommentsBody', 'Не удалось загрузить отзывы', 'Проверьте соединение');
    }
}

// Comments scroll handling - attach to scrollable container
function initCommentsScroll() {
    const modal = document.getElementById('commentsModal');
    if (!modal) return;
    // The scrollable element is .modal-content inside the modal
    const scrollContainer = modal.querySelector('.modal-content');
    if (!scrollContainer) return;
    
    scrollContainer.addEventListener('scroll', function() {
        const pageNumber = parseInt(modal.dataset.pageCount || '0');
        const packageName = modal.dataset.packageName;
        const allCommentsLoaded = modal.dataset.allCommentsLoaded === 'true';
        const canLoad = modal.dataset.canLoad === 'true';
        
        if (this.scrollTop + this.clientHeight >= this.scrollHeight - 50 && packageName && !allCommentsLoaded && canLoad) {
            modal.dataset.canLoad = 'false';
            modal.dataset.pageCount = pageNumber + 1;
            showComments(packageName, pageNumber + 1, false);
        }
    });
}

// Image Preview functions
function openPreview(imageUrl, event) {
    const modal = document.getElementById('imagePreviewModal');
    const currentCard = event.target.closest('.app-card');
    if (!currentCard) return;
    const screenshots = Array.from(currentCard.querySelectorAll('.screenshots-container img'));
    
    state.images = screenshots.map(img => img.src);
    state.imageIndex = state.images.indexOf(imageUrl);
    
    const previewImg = document.getElementById('previewImage');
    if (previewImg) previewImg.src = imageUrl;
    modal.classList.remove('hidden');
    modal.classList.add('show');
    modal.focus();
    modal.setAttribute('tabindex', '0');
    
    updateNavigationButtons();
}

function updateNavigationButtons() {
    const prevButton = document.getElementById('prevImage');
    const nextButton = document.getElementById('nextImage');
    const progressIndicator = document.getElementById('imageProgress');
    if (!prevButton || !nextButton || !progressIndicator) return;
    
    prevButton.style.display = state.imageIndex > 0 ? 'block' : 'none';
    nextButton.style.display = state.imageIndex < state.images.length - 1 ? 'block' : 'none';
    progressIndicator.textContent = `${state.imageIndex + 1} / ${state.images.length}`;
}

function navigateImage(direction) {
    if (direction === 'prev' && state.imageIndex > 0) {
        state.imageIndex--;
    } else if (direction === 'next' && state.imageIndex < state.images.length - 1) {
        state.imageIndex++;
    }
    
    const previewImg = document.getElementById('previewImage');
    if (previewImg) previewImg.src = state.images[state.imageIndex];
    updateNavigationButtons();
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    modal.classList.add('hidden');
    modal.classList.remove('show');
    modal.removeAttribute('tabindex');
    state.images = [];
    state.imageIndex = 0;
    const progress = document.getElementById('imageProgress');
    if (progress) progress.textContent = '';
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const clearButton = document.getElementById('clearSearch');
    let searchTimeout;
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => searchApps(e.target.value), 500);
            if (clearButton) clearButton.classList.toggle('hidden', !e.target.value);
        });
    }
    
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                clearButton.classList.add('hidden');
                searchInput.focus();
                document.getElementById('searchResults').innerHTML = '';
                state.reset();
                state.query = '';
                state.isLoading = false;
            }
        });
    }
    
    // Modal close event listeners
    document.querySelectorAll('.modal-close').forEach(closeBtn => {
        closeBtn.onclick = () => {
            const modal = closeBtn.closest('.modal');
            if (!modal) return;
            const contentId = modal.querySelector('[id]')?.id;
            if (modal.id === 'imagePreviewModal') {
                closeImagePreview();
            } else {
                ModalManager.hide(modal.id, contentId);
            }
        };
    });
    
    // Image navigation
    const prevBtn = document.getElementById('prevImage');
    const nextBtn = document.getElementById('nextImage');
    if (prevBtn) prevBtn.onclick = () => navigateImage('prev');
    if (nextBtn) nextBtn.onclick = () => navigateImage('next');
    
    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        const imageModal = document.getElementById('imagePreviewModal');
        if (imageModal && !imageModal.classList.contains('hidden')) {
            if (['ArrowLeft', 'ArrowRight', 'Escape'].includes(e.key)) {
                e.preventDefault();
                if (e.key === 'ArrowLeft') navigateImage('prev');
                else if (e.key === 'ArrowRight') navigateImage('next');
                else if (e.key === 'Escape') closeImagePreview();
            }
        }
    });
    
    // Modal backdrop clicks
    window.onclick = e => {
        if (e.target.classList && e.target.classList.contains('modal')) {
            if (e.target.id === 'imagePreviewModal') {
                closeImagePreview();
            } else {
                const contentId = e.target.querySelector('[id]')?.id;
                ModalManager.hide(e.target.id, contentId);
            }
        }
    };
    
    // Infinite scroll for search results
    window.addEventListener('scroll', () => {
        if (state.isLoading || !state.hasMorePages) return;
        const scrollPosition = window.innerHeight + window.scrollY;
        const pageHeight = document.documentElement.scrollHeight;
        if (scrollPosition >= pageHeight - 200) {
            searchApps(state.query, true);
        }
    });
    
    // Comments filter change
    const filterSelect = document.getElementById('commentsFilterOption');
    if (filterSelect) {
        filterSelect.onchange = () => {
            const modal = document.getElementById('commentsModal');
            if (!modal) return;
            modal.dataset.pageCount = '0';
            modal.dataset.allCommentsLoaded = 'false';
            modal.dataset.canLoad = 'true';
            const packageName = modal.dataset.packageName;
            if (packageName) showComments(packageName, 0, false);
        };
    }
    
    // Initialize comments scroll handler
    initCommentsScroll();
});
