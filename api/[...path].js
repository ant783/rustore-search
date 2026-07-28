export default async function handler(req, res) {
  // ... (CORS, обработка OPTIONS)

  const targetUrl = `https://backapi.rustore.ru/${pathString}${queryString}`;

  const fetchOptions = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'ruStoreVerCode': '247',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      // Подмена IP (может не помочь, но попробуйте)
      'X-Forwarded-For': '192.168.1.1',
      'X-Real-IP': '192.168.1.1',
    },
  };
  // ... (остальное)
}
