// Обработчик поиска по ссылке
document.getElementById('searchByUrlBtn').addEventListener('click', async () => {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    if (!url) return;

    const packageName = extractPackageNameFromUrl(url);
    if (!packageName) {
        alert('Не удалось извлечь идентификатор приложения из ссылки. Пример правильной ссылки: https://www.rustore.ru/catalog/app/com.example.app');
        return;
    }

    // Показываем индикатор загрузки
    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Загрузка приложения...</p></div>';

    try {
        const appDetails = await fetchAppDetails(packageName);
        if (appDetails) {
            // Для совместимости с createAppCard нужен объект app с полями averageUserRating и totalRatings
            // Получим их из отдельного запроса или используем заглушки
            const ratingData = await fetchAppRating(packageName);
            const app = {
                averageUserRating: ratingData?.averageUserRating || 0,
                totalRatings: ratingData?.totalRatings || 0,
                packageName: packageName
            };
            resultsContainer.innerHTML = '';
            resultsContainer.appendChild(createAppCard(appDetails, app));
        } else {
            resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-gray-600">Приложение не найдено</p></div>';
        }
    } catch (error) {
        console.error('Error fetching by URL:', error);
        resultsContainer.innerHTML = '<div class="col-span-full text-center p-4"><p class="text-red-600">Ошибка загрузки приложения</p></div>';
    }
});

// Вспомогательная функция для извлечения packageName из URL RuStore
function extractPackageNameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        // Пример: https://www.rustore.ru/catalog/app/com.example.app
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

// Получение рейтинга приложения (можно дополнить при необходимости)
async function fetchAppRating(packageName) {
    try {
        const response = await fetch(`https://backapi.rustore.ru/applicationData/rating/${packageName}`);
        const data = await response.json();
        if (data.code === 'OK' && data.body) {
            return data.body;
        }
    } catch (error) {
        console.error('Error fetching rating:', error);
    }
    return null;
}
