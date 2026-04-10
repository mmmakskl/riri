// Vercel Serverless Function - скачивание видео через Instagram API
// POST: получить ссылку на скачивание
// GET ?url=...: проксировать видео (CORS, AssemblyAI, мобильное воспроизведение)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — проксирование видео (объединено с video-proxy для лимита 12 функций)
  if (req.method === 'GET') {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'url query param is required' });
    }
    let decodedUrl;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch {
      return res.status(400).json({ error: 'Invalid url' });
    }
    const allowedHosts = ['cdninstagram.com', 'fbcdn.net', 'scontent', 'cdn.fbsbx.com'];
    if (!allowedHosts.some(h => decodedUrl.includes(h))) {
      return res.status(403).json({ error: 'URL not allowed' });
    }
    try {
      const range = req.headers.range || '';
      const response = await fetch(decodedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VideoProxy/1.0)',
          ...(range && { Range: range }),
        },
      });
      if (!response.ok) {
        return res.status(response.status).json({ error: 'Upstream error' });
      }
      res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
      const contentLength = response.headers.get('content-length');
      const acceptRanges = response.headers.get('accept-ranges');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      if (response.status === 206) {
        res.setHeader('Content-Range', response.headers.get('content-range'));
        res.status(206);
      }
      const { Readable } = await import('stream');
      const reader = response.body.getReader();
      const stream = new Readable({
        async read() {
          try {
            const { done, value } = await reader.read();
            this.push(done ? null : Buffer.from(value));
          } catch (e) {
            this.destroy(e);
          }
        },
      });
      stream.on('error', () => res.end());
      stream.pipe(res);
    } catch (err) {
      console.error('Video proxy error:', err);
      return res.status(502).json({ error: 'Proxy failed' });
    }
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'url is required' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
  const RAPIDAPI_HOST = 'instagram120.p.rapidapi.com';

  try {
    console.log('Fetching download link for:', url);
    
    const response = await fetch(`https://${RAPIDAPI_HOST}/api/instagram/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      console.error('Instagram API error:', response.status);
      return res.status(response.status).json({ 
        error: 'Instagram API error', 
        status: response.status 
      });
    }

    const data = await response.json();
    console.log('Download API response:', JSON.stringify(data, null, 2));
    
    // Извлекаем URL видео из ответа - проверяем разные структуры
    let videoUrl = null;
    let thumbnailUrl = null;
    
    // Если ответ - это массив (как от instagram120 API)
    if (Array.isArray(data) && data.length > 0) {
      const item = data[0];
      
      // urls - массив с ссылками на скачивание
      if (item.urls && Array.isArray(item.urls) && item.urls.length > 0) {
        const mp4 = item.urls.find(u => u.extension === 'mp4' || u.name === 'MP4');
        videoUrl = mp4?.url || item.urls[0]?.url;
      }
      
      // pictureUrl - превью
      thumbnailUrl = item.pictureUrl || item.pictureUrlWrapped;
      
      // Fallback на другие поля
      if (!videoUrl) {
        videoUrl = item.video_url || item.url || item.video;
      }
    }
    // Прямые поля в объекте
    else if (data.video_url) {
      videoUrl = data.video_url;
    } else if (data.download_url) {
      videoUrl = data.download_url;
    } else if (data.video) {
      videoUrl = data.video;
    } else if (data.videoUrl) {
      videoUrl = data.videoUrl;
    }
    // Вложенные в data
    else if (data.data?.video_url) {
      videoUrl = data.data.video_url;
    } else if (data.data?.video) {
      videoUrl = data.data.video;
    }
    // Массив urls в объекте
    else if (data.urls && Array.isArray(data.urls) && data.urls.length > 0) {
      const mp4 = data.urls.find(u => u.extension === 'mp4' || u.name === 'MP4');
      videoUrl = mp4?.url || data.urls[0]?.url;
    }
    // Массив media
    else if (data.media && Array.isArray(data.media) && data.media.length > 0) {
      videoUrl = data.media[0]?.video_url || data.media[0]?.url;
    }
    
    console.log('Extracted videoUrl:', videoUrl);
    console.log('Extracted thumbnailUrl:', thumbnailUrl);
    
    return res.status(200).json({
      success: !!videoUrl,
      videoUrl,
      thumbnailUrl,
      rawResponse: data,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Failed to get download link', 
      details: error.message 
    });
  }
}
