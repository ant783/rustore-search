// api/[...path].js
export default async function handler(req, res) {
  // 1. Устанавливаем CORS-заголовки для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ruStoreVerCode, User-Agent');

  // 2. Обрабатываем preflight-запрос OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Извлекаем путь из запроса
  const { path } = req.query; // массив частей пути
  const pathString = Array.isArray(path) ? path.join('/') : path;

  // 4. Формируем URL для RuStore
  const params = new URLSearchParams(req.query);
  params.delete('path'); // удаляем служебный параметр
  const url = `https://backapi.rustore.ru/${pathString}${params.toString() ? '?' + params.toString() : ''}`;

  try {
    // 5. Создаём запрос к RuStore
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ruStoreVerCode': '247',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    // Для POST добавляем тело (если есть)
    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    // 6. Отправляем запрос к RuStore
    const response = await fetch(url, fetchOptions);
    const data = await response.json();

    // 7. Возвращаем ответ клиенту
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Ошибка прокси:', error);
    res.status(500).json({ error: error.message });
  }
}
