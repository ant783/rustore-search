// api/[...path].js
export default async function handler(req, res) {
  // 1. CORS для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ruStoreVerCode, User-Agent');

  // 2. Preflight (OPTIONS) — немедленный ответ
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 3. Собираем путь
  const { path } = req.query;
  const pathString = Array.isArray(path) ? path.join('/') : path || '';

  // 4. Параметры запроса (для GET)
  const params = new URLSearchParams(req.query);
  params.delete('path');
  const queryString = params.toString() ? '?' + params.toString() : '';

  const targetUrl = `https://backapi.rustore.ru/${pathString}${queryString}`;

  try {
    // 5. Готовим параметры для fetch
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ruStoreVerCode': '247',
        'User-Agent': 'Mozilla/5.0',
      },
    };

    // 6. Для POST передаём тело
    if (req.method === 'POST') {
      // В Vercel тело уже распарсено в req.body (если Content-Type: application/json)
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    // 7. Возвращаем ответ
    res.status(response.status).json(data);
  } catch (err) {
    console.error('❌ Ошибка прокси:', err.message);
    res.status(500).json({ error: err.message });
  }
}
