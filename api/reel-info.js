// Vercel Serverless Function - получение информации о рилсе по URL/shortcode
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, shortcode, userId, projectId, source } = req.body;

  if (!url && !shortcode) {
    return res.status(400).json({ error: 'url or shortcode is required' });
  }

  // ОСНОВНОЙ КЛЮЧ - оплаченный instagram-scraper-20251
  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || 'ff21c60e3dmsh5f27d005cc9811dp1d106ejsn8dc341d3ceb2';
  
  // Извлекаем shortcode из URL если нужно (reel, reels, p, tv)
  let code = shortcode;
  if (!code && url) {
    const match = url.match(/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
    code = match ? match[1] : null;
  }

  if (!code) {
    return res.status(400).json({ error: 'Could not extract shortcode from URL' });
  }

  console.log('Fetching reel info for shortcode:', code);

  // Используем оплаченный API instagram-scraper-20251
  try {
    // Endpoint: postdetail/?code_or_url=CODE (только shortcode!)
    const apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/postdetail/?code_or_url=${code}`;
    console.log('Calling instagram-scraper-20251:', apiUrl);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
        'x-rapidapi-key': RAPIDAPI_KEY,
      },
    });

    console.log('API status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      // API может вернуть data.data, data.items[0] или data напрямую
      const media = data?.data || data?.items?.[0] || data;
      console.log('API raw response keys:', media ? Object.keys(media).slice(0, 25) : 'no data');
      
      if (media) {
        // Статистика в metrics
        const metrics = media.metrics || {};
        
        // Извлекаем view_count из metrics.play_count или metrics.ig_play_count
        const viewCount = metrics.play_count || metrics.ig_play_count || metrics.view_count || 
                         media.play_count || media.video_view_count || 0;
        
        const likeCount = metrics.like_count || media.like_count || 0;
        const commentCount = metrics.comment_count || media.comment_count || 0;
        
        // Карусель: несколько фото/видео в одном посте
        const carouselMedia = media.carousel_media || (media.carousel_media_count && media.children?.items) || media.edge_sidecar_to_children?.edges;
        let carousel_slides = [];
        const getImageUrl = (item) => {
          return item.image_versions2?.candidates?.[0]?.url
            || item.image_versions?.candidates?.[0]?.url
            || item.image_versions?.items?.[0]?.url
            || item.image_versions2?.items?.[0]?.url
            || item.display_url
            || item.images?.standard_resolution?.url
            || item.images?.low_resolution?.url
            || item.thumbnail_src
            || item.url
            || (item.video_versions?.[0]?.url ? item.video_versions[0].url : null);
        };
        if (Array.isArray(carouselMedia) && carouselMedia.length > 0) {
          carousel_slides = carouselMedia.map((item, i) => {
            const url = getImageUrl(item);
            return { url: url || '', index: i };
          }).filter(s => s.url);
          if (carousel_slides.length > 0) {
            console.log('Carousel first slide URL:', carousel_slides[0].url?.slice(0, 80));
          }
        } else if (Array.isArray(media.children?.items)) {
          carousel_slides = media.children.items.map((item, i) => ({
            url: getImageUrl(item) || '',
            index: i,
          })).filter(s => s.url);
        }
        const is_carousel = carousel_slides.length > 1;

        // Предпочитаем Instagram CDN (cdninstagram, fbcdn) — workers.dev часто даёт 403
        const candidates = media.image_versions2?.candidates || media.image_versions?.candidates || [];
        const cdnUrl = candidates.find((c) => {
          const u = c?.url || '';
          return u.includes('cdninstagram.com') || u.includes('fbcdn.net') || u.includes('scontent.');
        })?.url;
        // Максимум fallback'ов: API может возвращать разные структуры
        const fallbackThumb = media.thumbnail_url
          || candidates[0]?.url
          || media.display_url
          || media.display_resources?.[0]?.src
          || media.thumbnail_src
          || media.image_versions?.items?.[0]?.url
          || carousel_slides[0]?.url
          || '';

        const result = {
          success: true,
          shortcode: code,
          url: url || (is_carousel ? `https://www.instagram.com/p/${code}/` : `https://www.instagram.com/reel/${code}/`),
          thumbnail_url: cdnUrl || fallbackThumb,
          video_url: media.video_url || media.video_versions?.[0]?.url || '',
          caption: media.caption?.text || (typeof media.caption === 'string' ? media.caption : '') || '',
          view_count: viewCount,
          like_count: likeCount,
          comment_count: commentCount,
          taken_at: media.taken_at || media.taken_at_ts,
          owner: {
            username: media.user?.username || '',
            full_name: media.user?.full_name || '',
          },
          is_video: media.is_video || media.media_type === 2 || !!media.video_url,
          is_carousel: is_carousel,
          carousel_slides: is_carousel ? carousel_slides.map(s => s.url) : undefined,
          slide_count: is_carousel ? carousel_slides.length : undefined,
          api_used: 'instagram-scraper-20251',
        };
        
        console.log('Extracted post info:', {
          shortcode: result.shortcode,
          is_carousel: result.is_carousel,
          slide_count: result.slide_count,
          view_count: result.view_count,
          like_count: result.like_count,
          owner: result.owner.username,
        });
        
        // Если получили данные - возвращаем
        if (result.view_count || result.like_count || result.thumbnail_url || result.owner.username || result.is_carousel) {
          logApiCall({ apiName: 'rapidapi', action: 'reel-info', userId, projectId, metadata: { shortcode: code, owner: result.owner.username, source } });
          return res.status(200).json(result);
        }
      }
    } else {
      const errorText = await response.text();
      console.log('API error:', response.status, errorText);
    }
  } catch (e) {
    console.error('API error:', e.message);
  }

  // Если ничего не сработало - возвращаем минимум
  return res.status(200).json({
    success: false,
    shortcode: code,
    url: url || `https://www.instagram.com/reel/${code}/`,
    error: 'Could not fetch reel info',
  });
}
