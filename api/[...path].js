// api/[...path].js
export default async function handler(req, res) {
  // Устанавливаем CORS для всех ответов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ruStoreVerCode, User-Agent');

  // Отвечаем на preflight (OPTIONS) сразу
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Извлекаем путь и параметры из запроса
  const { path } = req.query;
  const pathString = Array.isArray(path) ? path.join('/') : path || '';
  const params = new URLSearchParams(req.query);
  params.delete('path');
  const queryString = params.toString() ? '?' + params.toString() : '';

  const targetUrl = `https://backapi.rustore.ru/${pathString}${queryString}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'ruStoreVerCode': '247',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };

    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('Ошибка прокси:', err.message);
    res.status(500).json({ error: err.message });
  }
}
