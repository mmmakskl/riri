// Vercel Serverless Function — перевод через OpenRouter (Gemini) или бесплатный Google Translate
import { callOpenRouter, MODELS } from '../lib/openRouter.js';
import { logApiCall } from '../lib/logApiCall.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, to = 'ru', userId, projectId } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  console.log(`Translating ${text.length} chars to ${to}`);

  const apiKey = process.env.OPENROUTER_API_KEY;

  try {
    if (apiKey) {
      // Перевод через OpenRouter (Gemini)
      const targetLang = to === 'ru' ? 'русский' : to === 'en' ? 'английский' : to;
      const prompt = `Translate the following text to ${targetLang}. Output only the translation, no explanations or extra text.\n\n${text}`;

      const { text: translated } = await callOpenRouter({
        apiKey,
        model: MODELS.FLASH,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
      });

      if (!translated) {
        throw new Error('OpenRouter returned empty translation');
      }

      logApiCall({ apiName: 'openrouter', action: 'translate', userId, projectId, metadata: { to, chars: text.length } });
      return res.status(200).json({
        success: true,
        original: text,
        translated,
        from: 'auto',
        to,
      });
    }

    // Fallback: бесплатный Google Translate API (gtx client)
    // Автоопределение языка, перевод на русский
    // Лимит ~5000 символов за запрос

    const chunks = splitText(text, 4500);
    const translations = [];

    for (const chunk of chunks) {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(chunk)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.error('Google Translate error:', response.status);
        translations.push(chunk); // Оставляем оригинал
        continue;
      }

      const data = await response.json();

      // Парсим ответ Google Translate
      // Формат: [[[translated, original, ...], ...], ...]
      if (data && data[0] && Array.isArray(data[0])) {
        const translatedParts = data[0]
          .filter((part) => part && part[0])
          .map((part) => part[0]);
        translations.push(translatedParts.join(''));
      } else {
        console.error('Unexpected response format:', data);
        translations.push(chunk);
      }

      // Небольшая задержка между запросами
      if (chunks.length > 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const translatedText = translations.join(' ');

    // Определяем исходный язык из ответа (если был один chunk)
    let detectedLang = 'auto';
    try {
      const testUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${to}&dt=t&q=${encodeURIComponent(text.slice(0, 100))}`;
      const testResponse = await fetch(testUrl);
      const testData = await testResponse.json();
      if (testData && testData[2]) {
        detectedLang = testData[2];
      }
    } catch (e) {
      // ignore
    }

    return res.status(200).json({
      success: true,
      original: text,
      translated: translatedText,
      from: detectedLang,
      to,
    });
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: 'Failed to translate',
      details: error.message,
    });
  }
}

// Разбивает текст на части с сохранением предложений
function splitText(text, maxLength) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  const sentences = text.split(/(?<=[.!?।॥])\s+/); // Добавил индийские знаки препинания
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length + 1 <= maxLength) {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      if (sentence.length > maxLength) {
        // Разбиваем по словам если предложение слишком длинное
        const words = sentence.split(/\s+/);
        currentChunk = '';
        for (const word of words) {
          if (currentChunk.length + word.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? ' ' : '') + word;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      } else {
        currentChunk = sentence;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}
