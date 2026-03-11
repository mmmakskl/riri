// Vercel Serverless Function - транскрибация видео через AssemblyAI, каруселей через OpenRouter (Gemini)
import { callOpenRouter, MODELS, MODELS_FALLBACK, geminiPartToOpenRouterImage } from '../lib/openRouter.js';
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_KEY || '5be12ca7de974d5bbdda7084c37ab4e0';

  // GET - проверка статуса транскрипции
  if (req.method === 'GET') {
    const { transcriptId } = req.query;
    
    if (!transcriptId) {
      return res.status(400).json({ error: 'transcriptId is required' });
    }

    try {
      const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': ASSEMBLYAI_KEY,
        },
      });

      const data = await response.json();
      
      return res.status(200).json({
        status: data.status,
        text: data.text,
        words: data.words,
        error: data.error,
      });
    } catch (error) {
      console.error('AssemblyAI status error:', error);
      return res.status(500).json({ error: 'Failed to check transcription status' });
    }
  }

  // POST - создание транскрипции (видео: audioUrl | карусель: imageUrls/images)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const { audioUrl, userId, projectId } = body;
  const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  const imagesBase64 = Array.isArray(body.images) ? body.images : [];

  // Карусель: imageUrls или images → OpenRouter (Gemini)
  if (imageUrls.length > 0 || imagesBase64.length > 0) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
    }
    const BATCH_SIZE = 9;
    const MAX_TOTAL = 50;
    let allParts = [];
    if (imageUrls.length > 0) {
      if (imageUrls.length > MAX_TOTAL) {
        return res.status(400).json({ error: `Maximum ${MAX_TOTAL} images per request` });
      }
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      };
      const fetchOne = async (url, idx) => {
        const h = { ...headers };
        if (url.includes('cdninstagram.com') || url.includes('instagram.com') || url.includes('fbcdn.net') || url.includes('scontent.')) {
          h['Referer'] = 'https://www.instagram.com/';
        }
        try {
          const resp = await fetch(url, { headers: h });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const buf = await resp.arrayBuffer();
          const base64 = Buffer.from(buf).toString('base64');
          const contentType = resp.headers.get('content-type') || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim() || 'image/jpeg';
          return { ok: true, idx, data: { inlineData: { mimeType, data: base64 } } };
        } catch (e) {
          console.error('Failed to fetch image', idx, url?.slice(0, 80), e.message);
          return { ok: false, idx };
        }
      };
      const results = await Promise.all(imageUrls.map((url, idx) => fetchOne(url, idx)));
      const succeeded = results.filter((r) => r.ok).sort((a, b) => a.idx - b.idx);
      allParts = succeeded.map((r) => r.data);
      const failedCount = results.length - succeeded.length;
      if (allParts.length === 0) {
        return res.status(400).json({ error: 'Failed to fetch any images. Check URLs or try again.' });
      }
      if (failedCount > 0) {
        console.warn('Skipped failed images:', failedCount);
      }
    } else {
      if (imagesBase64.length > MAX_TOTAL) {
        return res.status(400).json({ error: `Maximum ${MAX_TOTAL} images per request` });
      }
      for (const img of imagesBase64) {
        if (!img.data) {
          return res.status(400).json({ error: 'Each image must have "data" (base64)' });
        }
        allParts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/jpeg',
            data: img.data.replace(/^data:image\/\w+;base64,/, ''),
          },
        });
      }
    }
    const promptTemplate = (batchSize, offset) => `Extract ALL visible text from ${batchSize} Instagram carousel slides (${offset + 1}–${offset + batchSize}). For each image: text only. Reply JSON only:
{"slides":[{"slide_index":0,"text":"...","description":""},{"slide_index":1,"text":"...","description":""}],"full_text":"all text combined"}`;
    const allSlides = [];
    const fullTexts = [];
    try {
      for (let i = 0; i < allParts.length; i += BATCH_SIZE) {
        const batch = allParts.slice(i, i + BATCH_SIZE);
        const prompt = promptTemplate(batch.length, i);
        const content = [
          { type: 'text', text: prompt },
          ...batch.map((p) => geminiPartToOpenRouterImage(p)),
        ];
        let lastErr = null;
        let batchDone = false;
        for (const model of MODELS_FALLBACK) {
          try {
            const { text: rawText } = await callOpenRouter({
              apiKey,
              model,
              messages: [{ role: 'user', content }],
              temperature: 0.2,
              max_tokens: 4096,
              response_format: { type: 'json_object' },
            });
            if (!rawText) continue;
            let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
            jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
            let parsed;
            try {
              parsed = JSON.parse(jsonStr);
            } catch (e) {
              continue;
            }
            const slides = Array.isArray(parsed.slides) ? parsed.slides : [];
            for (const s of slides) {
              allSlides.push({
                slide_index: i + s.slide_index,
                text: s.text || '',
                description: s.description || '',
              });
            }
            if (typeof parsed.full_text === 'string' && parsed.full_text.trim()) {
              fullTexts.push(parsed.full_text);
            } else {
              fullTexts.push(slides.map((s) => s.text).join('\n\n'));
            }
            batchDone = true;
            break;
          } catch (e) {
            lastErr = e.message;
            if (e.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
          }
        }
        if (!batchDone) {
          return res.status(502).json({ error: 'OpenRouter API error', details: lastErr || 'Empty response' });
        }
      }
      const fullText = fullTexts.join('\n\n');
      logApiCall({ apiName: 'openrouter', action: 'transcribe-carousel', userId, projectId, metadata: { slidesCount: allSlides.length } });
      return res.status(200).json({
        success: true,
        transcript_text: fullText,
        transcript_slides: allSlides,
      });
    } catch (e) {
      console.error('Transcribe carousel error:', e);
      return res.status(500).json({ error: 'Transcribe carousel failed', details: e.message });
    }
  }

  // Видео: audioUrl → AssemblyAI
  if (!audioUrl) {
    return res.status(400).json({ error: 'audioUrl is required (video) or imageUrls/images (carousel)' });
  }

  // AssemblyAI не может загружать с Instagram CDN — проксируем через наш API
  const INSTAGRAM_CDN = ['cdninstagram.com', 'fbcdn.net', 'scontent', 'cdn.fbsbx.com'];
  const isInstagramCdn = INSTAGRAM_CDN.some(h => audioUrl.includes(h));
  const isOurStorage = audioUrl.includes('supabase.co');
  let audioUrlForAssembly = audioUrl;
  if (isInstagramCdn && !isOurStorage) {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers['host'] || process.env.VERCEL_URL || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`.replace(/:\d+$/, ''); // убрать порт для прода
    audioUrlForAssembly = `${baseUrl}/api/download-video?url=${encodeURIComponent(audioUrl)}`;
    console.log('Using proxy URL for AssemblyAI:', audioUrlForAssembly.slice(0, 80) + '...');
  }

  try {
    console.log('Starting transcription for:', audioUrlForAssembly.slice(0, 100));
    const response = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': ASSEMBLYAI_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrlForAssembly,
        language_detection: true,
      }),
    });

    if (!response.ok) {
      console.error('AssemblyAI error:', response.status);
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: 'AssemblyAI error', 
        details: errorData 
      });
    }

    const data = await response.json();
    console.log('Transcription started, id:', data.id);
    logApiCall({ apiName: 'assemblyai', action: 'transcribe', userId, projectId, metadata: { transcriptId: data.id } });
    return res.status(200).json({
      success: true,
      transcriptId: data.id,
      status: data.status,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ 
      error: 'Failed to start transcription', 
      details: error.message 
    });
  }
}
