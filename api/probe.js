const domains = [
  'https://truyenqq.com.vn',
  'https://truyenqqviet.com',
  'https://truyenqqno.com',
  'https://truyenqqto.com',
  'https://nettruyennew.com',
  'https://nettruyenviet10.com',
  'https://nettruyenbb.com',
  'https://nettruyentv.me',
  'https://hinettruyen.com',
  'https://gonettruyen.com',
  'https://cuutruyen.net',
  'https://api.mangadex.org/manga?limit=5&availableTranslatedLanguage[]=vi'
];

module.exports = async (req, res) => {
  const results = [];
  for (const d of domains) {
    try {
      const start = Date.now();
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(d, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      clearTimeout(to);
      const text = await resp.text();
      const isCF = text.includes('Just a moment...') || text.includes('cf-browser-verification');
      results.push({
        url: d,
        status: resp.status,
        ms: Date.now() - start,
        len: text.length,
        isCF,
        sample: text.slice(0, 150).replace(/\s+/g, ' ')
      });
    } catch (e) {
      results.push({ url: d, error: e.message });
    }
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(results, null, 2));
};
