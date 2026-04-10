// Vercel Serverless Function - получение видео пользователя по username
// Поддерживает count (12/24/36) для постраничной загрузки (аналитика)
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, count, userId, projectId, source } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '959a088626msh74020d3fb11ad19p1e067bjsnb273d9fac830';
  const cleanUsername = username.replace(/^@/, '').trim().toLowerCase();

  // Helper: parse items from API response
  const parseItems = (data) => {
    let items = data?.data?.items || data?.items || data?.data || data?.reels;
    if (!items || !Array.isArray(items)) {
      if (data?.data?.user?.edge_owner_to_timeline_media?.edges) {
        items = data.data.user.edge_owner_to_timeline_media.edges.map(e => e.node);
      }
    }
    return Array.isArray(items) ? items : [];
  };

  // Helper: определяем, является ли ролик пробным (trial reels)
  // Пробный режим: видео показывается только не-подписчикам, play_count обычно < 5000
  // В API это может быть product_type === 'trial_reels', audience_category, или is_trial_reel
  const isTrialReel = (item) => {
    const pt = item.product_type || item.media_type_label || '';
    if (pt === 'trial_reels' || pt === 'trial') return true;
    if (item.is_trial_reel === true) return true;
    if (item.audience_category === 'only_non_followers') return true;
    // Дополнительная эвристика: clips_play_count (просмотры в ленте рилсов) vs play_count (общие)
    // Если clips_play_count есть и значительно меньше play_count — это может быть пробный
    // (но это ненадёжно, так что только явные флаги)
    return false;
  };

  // Helper: map raw item → reel object
  const mapReel = (item) => ({
    id: item.id || item.pk,
    shortcode: item.code || item.shortcode,
    url: `https://www.instagram.com/reel/${item.code || item.shortcode}/`,
    thumbnail_url: item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url || item.display_url || item.thumbnail_src,
    caption: (item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || '').slice(0, 500),
    view_count: item.play_count || item.view_count || item.video_view_count || 0,
    like_count: item.like_count || item.edge_liked_by?.count || 0,
    comment_count: item.comment_count || item.edge_media_to_comment?.count || 0,
    taken_at: item.taken_at || item.taken_at_timestamp,
    owner: { username: cleanUsername },
    product_type: item.product_type || 'clips',
    is_trial: isTrialReel(item),
  });

  // Helper: filter pinned/highlighted reels
  const filterPinned = (item) =>
    !item.is_pinned && !item.pinned && !item.is_highlight && !item.highlight &&
    !item.is_featured && !item.featured && !item.pinned_reel && !item.highlight_reel;

  const targetCount = count ? Math.min(Number(count), 60) : 12;
  // API always returns 12 per page; cursor lives at top-level: data.pagination_token
  const MAX_PAGES = Math.ceil(targetCount / 12);

  console.log(`Fetching reels for @${cleanUsername}, target=${targetCount}, max_pages=${MAX_PAGES}`);

  const allReels = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    try {
      let apiUrl = `https://instagram-scraper-20251.p.rapidapi.com/userreels/?username_or_id=${cleanUsername}&url_embed_safe=true`;
      if (cursor) apiUrl += `&pagination_token=${encodeURIComponent(cursor)}`;

      console.log(`Page ${page + 1} url: ${apiUrl.split('?')[1]}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      let response;
      try {
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'x-rapidapi-host': 'instagram-scraper-20251.p.rapidapi.com',
            'x-rapidapi-key': RAPIDAPI_KEY,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        console.error(`Page ${page + 1} HTTP error:`, response.status);
        break;
      }

      const data = await response.json();
      const items = parseItems(data);
      console.log(`Page ${page + 1} items: ${items.length}, cursor_before: ${cursor ? cursor.slice(0, 20) : 'null'}`);

      if (items.length === 0) {
        // Log full response to diagnose empty results (account not found, private, etc.)
        console.log(`Page ${page + 1} empty response:`, JSON.stringify(data).slice(0, 600));
        break;
      }

      const reels = items.filter(filterPinned).map(mapReel).filter(r => r.shortcode);
      allReels.push(...reels);

      // Cursor is at top-level as pagination_token (confirmed from logs)
      cursor =
        data?.pagination_token ||
        data?.data?.next_cursor ||
        data?.data?.next_max_id ||
        data?.data?.end_cursor ||
        data?.next_cursor ||
        data?.next_max_id ||
        null;

      console.log(`Page ${page + 1} next cursor: ${cursor ? cursor.slice(0, 20) + '...' : 'none'}`);

      if (!cursor) { console.log('No cursor, stopping'); break; }
      if (allReels.length >= targetCount) break;

      if (page < MAX_PAGES - 1) await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      console.error(`Page ${page + 1} exception:`, e.message);
      break;
    }
  }

  // Deduplicate
  const seen = new Set();
  const uniqueReels = allReels.filter(r => {
    if (seen.has(r.shortcode)) return false;
    seen.add(r.shortcode);
    return true;
  });

  console.log(`Total unique reels: ${uniqueReels.length}`);

  // Логируем реальное кол-во страниц (HTTP запросов к RapidAPI)
  const pagesUsed = allReels.length > 0 ? Math.ceil(allReels.length / 12) : 1;
  logApiCall({ apiName: 'rapidapi', action: 'user-reels', callsCount: pagesUsed, userId, projectId, metadata: { username: cleanUsername, reelsCount: uniqueReels.length, requestedCount: targetCount, source } });

  if (uniqueReels.length > 0) {
    return res.status(200).json({
      success: true,
      username: cleanUsername,
      reels: uniqueReels,
      count: uniqueReels.length,
      api_used: 'instagram-scraper-20251',
    });
  }

  return res.status(200).json({
    success: false,
    username: cleanUsername,
    reels: [],
    count: 0,
    message: 'Could not fetch user reels',
  });
}
