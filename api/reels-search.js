// Vercel Serverless Function — прокси для RapidAPI: поиск рилсов и хэштегов
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { type, keyword, hashtag, userId, projectId } = req.query;

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
  const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com';
  const headers = { 'X-RapidAPI-Key': RAPIDAPI_KEY, 'X-RapidAPI-Host': RAPIDAPI_HOST };

  try {
    let url;
    let action;

    if (type === 'hashtag' || hashtag) {
      const tag = hashtag || keyword;
      if (!tag) return res.status(400).json({ error: 'hashtag is required' });
      url = `https://${RAPIDAPI_HOST}/hashtag/${encodeURIComponent(tag)}/?count=50`;
      action = 'hashtag';
    } else {
      if (!keyword) return res.status(400).json({ error: 'keyword is required' });
      url = `https://${RAPIDAPI_HOST}/searchreels/?keyword=${encodeURIComponent(keyword)}&url_embed_safe=true&count=50`;
      action = 'search';
    }

    console.log(`Fetching ${action}:`, url);

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      console.log(`${action} API response status:`, response.status);
      return res.status(response.status).json({ error: `${action} API error`, status: response.status });
    }

    const data = await response.json();
    console.log(`${action} response:`, Array.isArray(data?.data) ? `${data.data.length} items` : Object.keys(data));
    logApiCall({ apiName: 'rapidapi', action, userId, projectId, metadata: { keyword: keyword || hashtag } });
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Failed to fetch reels', details: error.message });
  }
}
