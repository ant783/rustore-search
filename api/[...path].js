// api/[...path].js
export default async function handler(req, res) {
  // Разрешаем CORS для всех
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ruStoreVerCode, User-Agent');

  // Preflight (OPTIONS) – сразу отвечаем
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Собираем путь и параметры
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
        'User-Agent': 'Mozilla/5.0',
      },
    };

    if (req.method === 'POST') {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
