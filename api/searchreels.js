// Vercel Serverless Function - прокси для RapidAPI
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { keyword, userId, projectId } = req.query;

  if (!keyword) {
    return res.status(400).json({ error: 'keyword is required' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '60b367f230mshd3ca48b7e1fa21cp18f206jsn57b97472bcca';
  const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com';

  try {
    // Пробуем запросить больше результатов с разными параметрами
    const url = `https://${RAPIDAPI_HOST}/searchreels/?keyword=${encodeURIComponent(keyword)}&url_embed_safe=true&count=50`;
    
    console.log('Fetching reels:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    const data = await response.json();
    
    console.log('Reels response items:', Array.isArray(data?.data) ? data.data.length : 'not array');
    
    logApiCall({ apiName: 'rapidapi', action: 'search', userId, projectId, metadata: { keyword } });
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch reels', details: error.message });
  }
}
