// api/[...path].js
export default async function handler(req, res) {
  // Устанавливаем CORS-заголовки для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ruStoreVerCode, User-Agent');

  // Обрабатываем preflight-запрос OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Извлекаем путь из запроса
  const { path } = req.query; // массив частей пути
  const pathString = Array.isArray(path) ? path.join('/') : path;

  // Формируем URL для RuStore
  const params = new URLSearchParams(req.query);
  params.delete('path'); // убираем служебный параметр
  const queryString = params.toString() ? '?' + params.toString() : '';
  const targetUrl = `https://backapi.rustore.ru/${pathString}${queryString}`;

  console.log('🔄 Прокси запрос:', req.method, targetUrl);

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ruStoreVerCode': '247',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    // Для POST добавляем тело
    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    console.log('✅ Ответ от RuStore:', response.status);

    res.status(response.status).json(data);
  } catch (error) {
    console.error('❌ Ошибка прокси:', error.message);
    res.status(500).json({ error: error.message });
  }
}
