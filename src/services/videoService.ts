const RAPIDAPI_HOST = 'instagram-scraper-20251.p.rapidapi.com'; // Новый API
const RAPIDAPI_KEY = '60b367f230mshd3ca48b7e1fa21cp18f206jsn57b97472bcca'; // Новый ключ
const RAPIDAPI_HOST_OLD = 'instagram-looter2.p.rapidapi.com'; // Fallback API

// На production используем Vercel serverless прокси, локально — Vite прокси
const isDev = import.meta.env.DEV;
const API_BASE_URL = '/api-v1'; // Для старых endpoints (fetchReelData и т.д.)

export interface InstagramSearchResult {
  id: string;
  shortcode: string;
  url: string;
  thumbnail_url?: string;
  display_url?: string;
  caption?: string;
  like_count?: number;
  comment_count?: number;
  view_count?: number;
  taken_at?: string;
  owner?: {
    username?: string;
    full_name?: string;
  };
  is_video?: boolean;
  is_reel?: boolean;
}

export interface InstagramHashtag {
  name: string;
  media_count: number;
  id: string;
}

export interface InstagramUser {
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_verified: boolean;
  pk: string;
  id: string;
}

export interface InstagramSearchResponse {
  status: string;
  hashtags: Array<{
    position: number;
    hashtag: InstagramHashtag;
  }>;
  users: Array<{
    position: number;
    user: InstagramUser;
  }>;
  places: any[];
}

export interface ReelData {
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  taken_at?: string;
  description?: string;
  // Mock data поля (если API не возвращает)
  viralScore?: number; // Для совместимости со старой версией
}

/**
 * Извлекает данные о Reel из Instagram через RapidAPI
 * @param url - URL видео (Instagram Reel)
 * @returns Данные о видео
 */
export async function fetchReelData(url: string): Promise<ReelData> {
  try {
    // Извлекаем shortcode из URL Instagram
    const shortcode = extractShortcodeFromUrl(url);
    if (!shortcode) {
      console.warn('Could not extract shortcode from URL:', url);
      return getMockReelData();
    }

    // Пробуем разные варианты endpoints для получения данных о реелсе
    const endpoints = [
      `${API_BASE_URL}/reel/${shortcode}`,
      `${API_BASE_URL}/api/reel/${shortcode}`,
      `${API_BASE_URL}/post/${shortcode}`,
    ];

    let response: Response | null = null;
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Host': RAPIDAPI_HOST,
            'X-RapidAPI-Key': RAPIDAPI_KEY,
          },
        });
        if (res.ok) {
          response = res;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!response) {
      console.warn('API request failed: all endpoints failed');
      return getMockReelData();
    }

    const data = await response.json();
    
    // Извлекаем нужные поля из ответа API
    // TODO: Адаптируйте под реальную структуру ответа API instagram120
    return {
      view_count: data.view_count || data.views || undefined,
      like_count: data.like_count || data.likes || undefined,
      comment_count: data.comment_count || data.comments || undefined,
      taken_at: data.taken_at || data.timestamp || undefined,
      description: data.description || data.caption || data.caption_text || undefined,
      // Mock: виральный балл (если API не возвращает)
      viralScore: calculateViralScore(
        data.view_count || data.views,
        data.like_count || data.likes,
        data.comment_count || data.comments
      ),
    };
  } catch (error) {
    console.error('Error fetching reel data:', error);
    return getMockReelData();
  }
}

/**
 * Извлекает shortcode из URL Instagram Reel
 */
function extractShortcodeFromUrl(url: string): string | null {
  const patterns = [
    /instagram\.com\/reel\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/p\/([A-Za-z0-9_-]+)/,
    /instagram\.com\/tv\/([A-Za-z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Вычисляет виральный балл на основе метрик
 * Mock функция - замените на реальную логику
 */
function calculateViralScore(
  views?: number,
  likes?: number,
  comments?: number
): number {
  if (!views || views === 0) return 0;
  
  const engagementRate = ((likes || 0) + (comments || 0)) / views;
  // Масштабируем до 100
  return Math.min(100, Math.round(engagementRate * 1000));
}

/**
 * Mock данные для случаев, когда API недоступен или не возвращает нужные поля
 * TODO: Удалите после настройки реального API
 */
function getMockReelData(): ReelData {
  return {
    view_count: Math.floor(Math.random() * 1000000) + 10000, // Mock: 10k-1M
    like_count: Math.floor(Math.random() * 50000) + 1000, // Mock: 1k-50k
    comment_count: Math.floor(Math.random() * 5000) + 100, // Mock: 100-5k
    taken_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // Mock: последние 30 дней
    description: 'Mock description - реальное описание будет загружено из API', // Mock
    viralScore: Math.floor(Math.random() * 100), // Mock: 0-100
  };
}

/**
 * Поиск в Instagram по ключевому слову (возвращает хэштеги и пользователей)
 * @param query - Поисковый запрос
 * @returns Результаты поиска с хэштегами и пользователями
 */
export async function searchInstagram(query: string): Promise<InstagramSearchResponse> {
  try {
    const cleanQuery = query.trim();
    
    if (!cleanQuery) {
      return { status: 'ok', hashtags: [], users: [], places: [] };
    }

    // Используем старый API для поиска хэштегов/пользователей
    const endpoint = `https://${RAPIDAPI_HOST_OLD}/search?query=${encodeURIComponent(cleanQuery)}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Host': RAPIDAPI_HOST_OLD,
        'X-RapidAPI-Key': RAPIDAPI_KEY,
      },
    });

    if (!response.ok) {
      console.warn('Instagram search API request failed:', response.status, response.statusText);
      return { status: 'error', hashtags: [], users: [], places: [] };
    }

    const data = await response.json();
    return data as InstagramSearchResponse;
  } catch (error) {
    console.error('Error searching Instagram:', error);
    return { status: 'error', hashtags: [], users: [], places: [] };
  }
}

/**
 * Получает посты/реелсы пользователя
 * @param username - Имя пользователя
 * @returns Список видео/реелсов
 */
export async function getUserReels(username: string): Promise<InstagramSearchResult[]> {
  try {
    const cleanUsername = username.replace(/^@/, '').trim();
    
    const endpoints = [
      `${API_BASE_URL}/user/${encodeURIComponent(cleanUsername)}`,
      `${API_BASE_URL}/user/${encodeURIComponent(cleanUsername)}/posts`,
      `${API_BASE_URL}/user/${encodeURIComponent(cleanUsername)}/media`,
      `https://${RAPIDAPI_HOST_OLD}/api/instagram/user/${encodeURIComponent(cleanUsername)}/posts`,
    ];

    for (const endpoint of endpoints) {
      try {
        const host = endpoint.includes(RAPIDAPI_HOST_OLD) ? RAPIDAPI_HOST_OLD : RAPIDAPI_HOST;
        console.log('Trying user endpoint:', endpoint);
        
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'X-RapidAPI-Host': host,
            'X-RapidAPI-Key': RAPIDAPI_KEY,
          },
        });

        console.log(`User endpoint ${endpoint} status:`, response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('User endpoint response structure:', Object.keys(data));
          let items: any[] = [];
          
          if (Array.isArray(data)) {
            items = data;
          } else if (data.posts && Array.isArray(data.posts)) {
            items = data.posts;
          } else if (data.media && Array.isArray(data.media)) {
            items = data.media;
          } else if (data.items && Array.isArray(data.items)) {
            items = data.items;
          } else if (data.data && Array.isArray(data.data)) {
            items = data.data;
          } else if (data.reels && Array.isArray(data.reels)) {
            items = data.reels;
          }

          const reels = items
            .filter((item: any) => {
              const isVideo = item.is_video || item.type === 'video' || item.media_type === 2;
              const isReel = item.is_reel || item.shortcode?.includes('reel') || item.url?.includes('/reel/');
              return isVideo || isReel;
            })
            .map((item: any) => transformSearchResult(item))
            .filter((item): item is InstagramSearchResult => item !== null);
          
          if (reels.length > 0) {
            console.log(`Found ${reels.length} reels from user ${cleanUsername}`);
            return reels;
          }
        }
      } catch (e) {
        console.warn(`Error with endpoint:`, e);
        continue;
      }
    }

    console.warn('No working endpoint found for user:', cleanUsername);
    return [];
  } catch (error) {
    console.error('Error fetching user reels:', error);
    return [];
  }
}

/**
 * Получает посты по хэштегу
 * @param hashtag - Хэштег (без #)
 * @returns Список видео/реелсов
 */
export async function getHashtagReels(hashtag: string): Promise<InstagramSearchResult[]> {
  try {
    const cleanHashtag = hashtag.replace(/^#/, '').replace(/\s+/g, '');
    
    if (!cleanHashtag) {
      return [];
    }

    console.log('Searching hashtag:', cleanHashtag);

    // На production используем Vercel serverless proxy /api/hashtagreels
    // На localhost используем Vite proxy /api-v1/hashtag/
    const endpoint = isDev 
      ? `${API_BASE_URL}/hashtag/${encodeURIComponent(cleanHashtag)}/`
      : `/api/hashtagreels?hashtag=${encodeURIComponent(cleanHashtag)}`;
    
    console.log('Hashtag endpoint:', endpoint);
    
    // Для локалки нужны заголовки RapidAPI, для прода - нет (прокси добавит)
    const headers: Record<string, string> = isDev 
      ? {
          'X-RapidAPI-Host': RAPIDAPI_HOST,
          'X-RapidAPI-Key': RAPIDAPI_KEY,
        }
      : {};
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    });

    console.log(`Hashtag response status: ${response.status}`);

    if (!response.ok) {
      console.warn('Hashtag API error:', response.status);
      return [];
    }

    const data = await response.json();
    console.log('Hashtag API response keys:', Object.keys(data));
    
    let items: any[] = [];
    
    // Проверяем разные структуры ответа
    if (Array.isArray(data)) {
      items = data;
    } else if (data.data && Array.isArray(data.data)) {
      items = data.data;
    } else if (data.posts && Array.isArray(data.posts)) {
      items = data.posts;
    } else if (data.media && Array.isArray(data.media)) {
      items = data.media;
    } else if (data.items && Array.isArray(data.items)) {
      items = data.items;
    } else if (data.reels && Array.isArray(data.reels)) {
      items = data.reels;
    } else if (data.edge_hashtag_to_media?.edges) {
      items = data.edge_hashtag_to_media.edges.map((e: any) => e.node);
    } else if (typeof data === 'object') {
      // Пробуем найти любой массив в объекте
      for (const key in data) {
        if (Array.isArray(data[key]) && data[key].length > 0) {
          items = data[key];
          console.log(`Found items in data.${key}:`, items.length);
          break;
        }
      }
    }

    console.log(`Extracted ${items.length} items from hashtag response`);

    if (items.length === 0) {
      return [];
    }

    // Фильтруем только видео/reels
    const reels = items
      .filter((item: any) => {
        const isVideo = item.is_video === true || item.type === 'video' || item.media_type === 2 || item.product_type === 'reels';
        const isReel = item.is_reel === true || 
                     item.shortcode?.includes('reel') || 
                     item.url?.includes('/reel/') || 
                     item.code?.includes('reel');
        return isVideo || isReel;
      })
      .map((item: any) => transformSearchResult(item))
      .filter((item): item is InstagramSearchResult => item !== null);
    
    console.log(`Found ${reels.length} reels from hashtag #${cleanHashtag}`);
    return reels;
  } catch (error) {
    console.error('Error fetching hashtag reels:', error);
    return [];
  }
}

/**
 * Получает информацию о рилсе по URL или shortcode
 * Использует instagram-scraper2 API который возвращает view_count
 */
export async function getReelByUrl(urlOrShortcode: string): Promise<InstagramSearchResult | null> {
  try {
    // Нормализуем URL
    let url = urlOrShortcode.trim();
    if (!url.startsWith('http')) {
      // Если передан shortcode
      url = `https://www.instagram.com/reel/${url}/`;
    }
    
    const shortcode = extractShortcodeFromUrl(url) || urlOrShortcode.trim();
    
    console.log('Fetching reel info for URL:', url);
    
    // Используем reel-info API который возвращает view_count
    try {
      const infoResponse = await fetch('/api/reel-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, shortcode, source: 'lenta' }),
      });
      
      if (infoResponse.ok) {
        const data = await infoResponse.json();
        console.log('Reel info API response:', data);
        
        if (data.success) {
          return {
            id: shortcode,
            shortcode: shortcode,
            url: data.url || url,
            thumbnail_url: data.thumbnail_url || '',
            display_url: data.thumbnail_url || '',
            caption: data.caption || 'Видео из Instagram',
            view_count: data.view_count,
            like_count: data.like_count,
            comment_count: data.comment_count,
            taken_at: data.taken_at ? String(data.taken_at) : undefined,
            owner: data.owner,
            is_video: true,
            is_reel: true,
          };
        }
      }
    } catch (e) {
      console.warn('Reel info API failed:', e);
    }
    
    // Fallback: используем download-video API для thumbnail
    const response = await fetch('/api/download-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    
    if (!response.ok) {
      console.error('Download API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Download API response for reel info:', data);
    
    if (data.rawResponse && Array.isArray(data.rawResponse) && data.rawResponse.length > 0) {
      const item = data.rawResponse[0];
      const meta = item.meta || {};
      
      return {
        id: shortcode,
        shortcode: shortcode,
        url: meta.sourceUrl || url,
        thumbnail_url: item.pictureUrl || data.thumbnailUrl || '',
        display_url: item.pictureUrl || '',
        caption: meta.title || 'Видео из Instagram',
        view_count: meta.viewCount || meta.videoViewCount,
        like_count: meta.likeCount,
        comment_count: meta.commentCount,
        taken_at: meta.takenAt ? String(meta.takenAt) : undefined,
        owner: {
          username: meta.username || '',
        },
        is_video: true,
        is_reel: true,
      };
    }
    
    // Fallback - минимальный объект
    console.warn('No data from API, creating minimal object');
    return {
      id: shortcode,
      shortcode: shortcode,
      url: url,
      thumbnail_url: '',
      caption: 'Видео из Instagram',
    };
  } catch (error) {
    console.error('Error fetching reel by URL:', error);
    return null;
  }
}

/**
 * Поиск ТОЛЬКО REELS в Instagram напрямую по ключевому слову
 * БЕЗ использования хэштегов - только прямые endpoints для reels
 */
export async function searchInstagramVideos(query: string): Promise<InstagramSearchResult[]> {
  try {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return [];
    }

    console.log('Searching for REELS with exact query:', cleanQuery);

    // На production используем Vercel serverless proxy /api/searchreels
    // На localhost используем Vite proxy /api-v1/searchreels
    const endpoint = isDev 
      ? `/api-v1/searchreels/?keyword=${encodeURIComponent(cleanQuery)}&url_embed_safe=true`
      : `/api/searchreels?keyword=${encodeURIComponent(cleanQuery)}`;
    
    try {
      console.log('Making request to:', endpoint);
      
      // Для локалки нужны заголовки RapidAPI, для прода - нет (прокси добавит)
      const headers: Record<string, string> = isDev 
        ? {
            'X-RapidAPI-Host': RAPIDAPI_HOST,
            'X-RapidAPI-Key': RAPIDAPI_KEY,
          }
        : {};
      
      const response = await fetch(endpoint, {
        method: 'GET',
        headers,
      });

      console.log(`Response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        console.log('API response:', data);
        console.log('Response structure:', Object.keys(data));
        
        let items: any[] = [];
        
        // Проверяем разные структуры ответа
        if (Array.isArray(data)) {
          items = data;
        } else if (data.data) {
          if (Array.isArray(data.data)) {
            items = data.data;
          } else if (data.data.posts && Array.isArray(data.data.posts)) {
            items = data.data.posts;
          } else if (data.data.reels && Array.isArray(data.data.reels)) {
            items = data.data.reels;
          } else if (data.data.items && Array.isArray(data.data.items)) {
            items = data.data.items;
          } else if (typeof data.data === 'object' && Object.keys(data.data).length > 0) {
            // Если data - объект с данными, пробуем извлечь массивы из него
            const dataObj = data.data;
            if (Array.isArray(dataObj.posts)) items = dataObj.posts;
            else if (Array.isArray(dataObj.reels)) items = dataObj.reels;
            else if (Array.isArray(dataObj.items)) items = dataObj.items;
            else if (Array.isArray(dataObj.videos)) items = dataObj.videos;
            else {
              // Пробуем найти любой массив в объекте
              for (const key in dataObj) {
                if (Array.isArray(dataObj[key])) {
                  items = dataObj[key];
                  break;
                }
              }
            }
          }
        } else if (data.posts && Array.isArray(data.posts)) {
          items = data.posts;
        } else if (data.reels && Array.isArray(data.reels)) {
          items = data.reels;
        } else if (data.items && Array.isArray(data.items)) {
          items = data.items;
        } else if (data.videos && Array.isArray(data.videos)) {
          items = data.videos;
        } else if (data.media && Array.isArray(data.media)) {
          items = data.media;
        } else if (data.results && Array.isArray(data.results)) {
          items = data.results;
        }
        
        console.log(`Extracted ${items.length} items from response`);
        
        // Фильтруем только reels/videos
        if (items.length > 0) {
          const reels = items
            .filter((item: any) => {
              const isVideo = item.is_video === true || item.type === 'video' || item.media_type === 2 || item.product_type === 'reels';
              const isReel = item.is_reel === true || 
                           item.shortcode?.includes('reel') || 
                           item.url?.includes('/reel/') || 
                           item.code?.includes('reel') ||
                           item.pk?.toString().startsWith('C');
              const isPost = item.url?.includes('/p/') && !item.url?.includes('/reel/');
              return (isVideo || isReel) && !isPost;
            })
            .map((item: any) => transformSearchResult(item))
            .filter((item): item is InstagramSearchResult => item !== null);
          
          if (reels.length > 0) {
            console.log(`Found ${reels.length} reels!`);
            return reels;
          }
        }
        
        console.log('No reels found in response');
      } else {
        console.warn(`API returned status ${response.status}`);
      }
    } catch (error) {
      console.error('Error searching for reels:', error);
    }

    return [];
  } catch (error) {
    console.error('Error searching Instagram videos:', error);
    return [];
  }
}


/**
 * Преобразует результат API в стандартный формат
 */
function transformSearchResult(item: any): InstagramSearchResult | null {
  try {
    // Извлекаем shortcode из URL или ID
    let shortcode = item.shortcode || item.code;
    if (!shortcode && item.url) {
      const match = item.url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
      if (match) shortcode = match[1];
    }
    if (!shortcode && item.id) {
      shortcode = item.id;
    }

    if (!shortcode) {
      return null;
    }

    // Формируем URL
    const url = item.url || `https://www.instagram.com/reel/${shortcode}/`;
    
    // Извлекаем caption - может быть строкой или объектом
    let caption = '';
    if (typeof item.caption === 'string') {
      caption = item.caption;
    } else if (item.caption?.text) {
      caption = item.caption.text;
    } else if (typeof item.text === 'string') {
      caption = item.text;
    } else if (typeof item.description === 'string') {
      caption = item.description;
    } else if (item.edge_media_to_caption?.edges?.[0]?.node?.text) {
      caption = item.edge_media_to_caption.edges[0].node.text;
    }
    
    return {
      id: item.id || shortcode,
      shortcode,
      url,
      thumbnail_url: item.thumbnail_url || item.thumbnail || item.display_url || item.image_url,
      display_url: item.display_url || item.thumbnail_url || item.image_url,
      caption,
      like_count: item.like_count || item.likes,
      comment_count: item.comment_count || item.comments,
      view_count: item.view_count || item.views || item.play_count,
      taken_at: item.taken_at || item.timestamp || item.created_at,
      owner: {
        username: item.owner?.username || item.user?.username || item.username || item.author?.username,
        full_name: item.owner?.full_name || item.user?.full_name || item.full_name || item.author?.full_name,
      },
      is_video: item.is_video || item.type === 'video' || item.media_type === 2,
      is_reel: item.is_reel || url.includes('/reel/'),
    };
  } catch (error) {
    console.error('Error transforming search result:', error);
    return null;
  }
}

/**
 * Анализирует видео через AI API (OpenAI/Claude)
 * @param _description - Описание видео
 * @returns Разбор видео
 */
export async function analyzeVideoMeaning(_description: string): Promise<{
  goal: string;
  trigger: string;
  structure: string;
}> {
  try {
    // TODO: Интегрируйте с OpenAI или Claude API
    // Пример с OpenAI:
    // const response = await fetch('https://api.openai.com/v1/chat/completions', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
    //   },
    //   body: JSON.stringify({
    //     model: 'gpt-4',
    //     messages: [{
    //       role: 'system',
    //       content: 'Ты эксперт по анализу контента. Разбери видео по следующим пунктам: Цель, Триггер, Структура.',
    //     }, {
    //       role: 'user',
    //       content: description,
    //     }],
    //   }),
    // });

    // Mock ответ для демонстрации
    // TODO: Замените на реальный вызов API
    return {
      goal: 'Экспертное видео / Юмор / Продажа (Mock - требует настройки OpenAI/Claude API)',
      trigger: 'Главный триггер, который цепляет аудиторию (Mock)',
      structure: '1. Хук\n2. Проблема\n3. Решение\n4. Призыв к действию (Mock)',
    };
  } catch (error) {
    console.error('Error analyzing video meaning:', error);
    return {
      goal: 'Не удалось проанализировать (ошибка API)',
      trigger: 'Требуется настройка AI API',
      structure: 'Проверьте подключение к OpenAI/Claude API',
    };
  }
}
