// Vercel Serverless Function - прокси для RapidAPI hashtag search
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { hashtag, userId, projectId } = req.query;

  if (!hashtag) {
    return res.status(400).json({ error: 'hashtag is required' });
  }

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '60b367f230mshd3ca48b7e1fa21cp18f206jsn57b97472bcca';
  const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com';

  try {
    // Пробуем endpoint для хэштегов с параметром count
    const url = `https://${RAPIDAPI_HOST}/hashtag/${encodeURIComponent(hashtag)}/?count=50`;
    
    console.log('Fetching hashtag:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });

    if (!response.ok) {
      console.log('Hashtag API response status:', response.status);
      return res.status(response.status).json({ error: 'Hashtag API error', status: response.status });
    }

    const data = await response.json();
    console.log('Hashtag API response keys:', Object.keys(data));
    logApiCall({ apiName: 'rapidapi', action: 'hashtag', userId, projectId, metadata: { hashtag } });
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch hashtag reels', details: error.message });
  }
}
