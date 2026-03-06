// Vercel Serverless — ИИ-сценарист: глубокий анализ структуры, генерация по теме/референсу, чат, проверка схожести.

import { callOpenRouter, MODELS, MODELS_FALLBACK } from '../lib/openRouter.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action;

  switch (action) {
    case 'analyze-structure':
      return handleAnalyzeStructure(req, res);
    case 'generate-from-topic':
      return handleGenerateFromTopic(req, res);
    case 'generate-from-reference':
      return handleGenerateFromReference(req, res);
    case 'chat':
      return handleChat(req, res);
    case 'check-similarity':
      return handleCheckSimilarity(req, res);
    case 'refine':
      return handleRefine(req, res);
    case 'refine-by-diff':
      return handleRefineByDiff(req, res);
    default:
      return res.status(400).json({
        error: 'Unknown action. Use: analyze-structure, generate-from-topic, generate-from-reference, chat, check-similarity, refine, refine-by-diff',
      });
  }
}

function parseJsonResponse(rawText) {
  let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(jsonStr);
  } catch (parseErr) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) {
      return JSON.parse(jsonStr.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, '$1'));
    }
    throw parseErr;
  }
}

async function callWithFallback(models, messages, opts = {}) {
  const { temperature = 0.2, response_format } = opts;
  let rawText = null;
  for (const model of models) {
    try {
      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature,
        ...(response_format && { response_format }),
      });
      rawText = result.text;
      if (rawText) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return rawText;
}

// ── Глубокий анализ структуры сценариев ──────────────────────────────────────

async function handleAnalyzeStructure(req, res) {
  const { scripts, training_mode } = req.body;
  if (!Array.isArray(scripts) || scripts.length < 2 || scripts.length > 10) {
    return res.status(400).json({ error: 'scripts: 2–10 items required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const parts = [];
  parts.push(`Задача: глубокий анализ ${scripts.length} сценариев для создания ИИ-сценариста.

Режим обучения: ${training_mode === 'scripts' ? 'пользователь загрузил свои сценарии' : 'сценарии из залётных рилсов (транскрипты)'}

Для каждого сценария ОБЯЗАТЕЛЬНО определи:
1. ХУК — первые 1-3 секунды/предложения. Как цепляет внимание? Сколько длится?
2. ТЕЛО — основная часть. Какие фазы есть (проблема → решение → доказательство → ...)? Сколько длится каждая фаза?
3. CTA / ПЕРЕГОН — есть ли призыв к действию в конце? Какой тип? (подписка, комментарий, сохранение, переход)
4. ОСОБЕННОСТИ — что уникального в стиле: тон, ритм, обращение к зрителю, эмоциональные триггеры, шаблонные фразы

Затем СРАВНИ все сценарии между собой:
— Что общего в структуре?
— Какие паттерны повторяются?
— Какая средняя длина? Разброс?
— Какой стиль подачи?

КРИТИЧНО:
— НЕ запоминай конкретные смыслы/факты — они уникальны для каждого видео
— ВЫЯВИ ПРАВИЛА: как структурировать, какой ритм, как строить хук, тело, CTA
— Промт должен описывать КАК писать сценарии, а не ЧТО писать

Ответ строго в формате JSON без markdown-блоков. Один валидный JSON:
{
  "prompt": "полный текст промта для генерации новых сценариев в этом стиле (на русском)",
  "meta": {
    "rules": ["правило 1", "правило 2", ...],
    "doNot": ["чего избегать 1", ...],
    "summary": "краткое описание стиля в 1–2 предложения"
  },
  "structure_analysis": {
    "hook_description": "описание типичного хука",
    "hook_duration": "примерная длительность хука (в секундах или словах)",
    "body_phases": ["фаза 1: описание", "фаза 2: описание", ...],
    "cta_type": "тип CTA или 'отсутствует'",
    "avg_length_seconds": число (примерная средняя длительность в секундах, 0 если неизвестно),
    "special_features": ["особенность 1", "особенность 2", ...]
  },
  "clarifying_questions": ["Правильно ли я понимаю, что ...?", ...]
}`);

  scripts.forEach((s, i) => {
    parts.push(`\n--- Сценарий ${i + 1} ---`);
    if (s.transcript_text) {
      parts.push(`Транскрипт/текст:\n${s.transcript_text}`);
    }
    if (s.translation_text) {
      parts.push(`Перевод:\n${s.translation_text}`);
    }
    if (s.script_text && s.script_text !== s.transcript_text) {
      parts.push(`Адаптация пользователя:\n${s.script_text}`);
    }
  });

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: parts.join('\n') }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const promptText = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!promptText) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const sa = parsed.structure_analysis && typeof parsed.structure_analysis === 'object' ? parsed.structure_analysis : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: promptText,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      structure_analysis: {
        hookDescription: sa.hook_description || '',
        hookDuration: sa.hook_duration || '',
        bodyPhases: Array.isArray(sa.body_phases) ? sa.body_phases : [],
        ctaType: sa.cta_type || '',
        avgLengthSeconds: typeof sa.avg_length_seconds === 'number' ? sa.avg_length_seconds : 0,
        specialFeatures: Array.isArray(sa.special_features) ? sa.special_features : [],
      },
      clarifying_questions: clarifying_questions.slice(0, 6),
    });
  } catch (err) {
    console.error('scriptwriter analyze-structure error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Генерация сценария по теме/идее ──────────────────────────────────────────

async function handleGenerateFromTopic(req, res) {
  const { prompt, topic, structure_analysis } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let systemText = prompt.trim();
  if (structure_analysis) {
    systemText += '\n\n--- СТРУКТУРА СЦЕНАРИЯ ---';
    if (structure_analysis.hookDescription) systemText += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) systemText += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) systemText += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) systemText += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
    if (structure_analysis.specialFeatures?.length) systemText += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const userText = `Тема/идея для сценария:\n${topic.trim()}\n\nНапиши полный сценарий по этой теме, строго следуя стилю и структуре из промта. Выводи только текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );

    if (!rawText?.trim()) {
      return res.status(502).json({ error: 'OpenRouter returned empty script' });
    }

    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter generate-from-topic error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Генерация сценария по видео-референсу ────────────────────────────────────

async function handleGenerateFromReference(req, res) {
  const { prompt, transcript_text, translation_text, structure_analysis } = req.body;
  if (!prompt?.trim() || !transcript_text?.trim()) {
    return res.status(400).json({ error: 'prompt and transcript_text are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let systemText = prompt.trim();
  if (structure_analysis) {
    systemText += '\n\n--- СТРУКТУРА СЦЕНАРИЯ ---';
    if (structure_analysis.hookDescription) systemText += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) systemText += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) systemText += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) systemText += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
    if (structure_analysis.specialFeatures?.length) systemText += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const userParts = ['Исходный сценарий (оригинал):\n' + transcript_text.trim()];
  if (translation_text?.trim()) {
    userParts.push('\nПеревод на русский:\n' + translation_text.trim());
  }
  userParts.push('\n\nСгенерируй мой сценарий (адаптацию) по этим данным, следуя структуре и стилю. Выводи только текст сценария, без пояснений.');

  let userText = userParts.join('');
  if (userText.length > 100000) {
    userText = userText.slice(0, 100000) + '\n\n[... текст обрезан ...]';
  }

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );

    if (!rawText?.trim()) {
      return res.status(502).json({ error: 'OpenRouter returned empty script' });
    }

    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter generate-from-reference error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Чат для итераций над сценарием ───────────────────────────────────────────

async function handleChat(req, res) {
  const { messages, prompt, script_text, structure_analysis } = req.body;
  if (!Array.isArray(messages) || !messages.length || !prompt?.trim()) {
    return res.status(400).json({ error: 'messages[] and prompt are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const systemParts = [
    'Ты ИИ-сценарист. Помогаешь пользователю создавать и дорабатывать сценарии для коротких видео (рилсы, шортсы).',
    '',
    'Стиль/подчерк (промт):',
    '---',
    prompt.trim(),
    '---',
    '',
  ];

  if (structure_analysis) {
    systemParts.push('Структура сценария:');
    if (structure_analysis.hookDescription) systemParts.push(`Хук: ${structure_analysis.hookDescription}`);
    if (structure_analysis.bodyPhases?.length) systemParts.push(`Фазы: ${structure_analysis.bodyPhases.join(' → ')}`);
    if (structure_analysis.ctaType) systemParts.push(`CTA: ${structure_analysis.ctaType}`);
    systemParts.push('');
  }

  if (script_text?.trim()) {
    systemParts.push('Текущий сценарий:');
    systemParts.push(script_text.trim().slice(0, 2000));
    systemParts.push('');
  }

  systemParts.push('Отвечай на русском. Когда предлагаешь новый вариант сценария, оберни его в блок:');
  systemParts.push('___СЦЕНАРИЙ___');
  systemParts.push('(полный текст сценария)');
  systemParts.push('___КОНЕЦ_СЦЕНАРИЯ___');

  const chatMessages = [
    { role: 'system', content: systemParts.join('\n') },
  ];

  for (const m of messages) {
    if ((m.role === 'user' || m.role === 'assistant') && m.content?.trim()) {
      chatMessages.push({ role: m.role, content: String(m.content).trim() });
    }
  }

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      chatMessages,
      { temperature: 0.5 }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let suggestedScript = null;
    const match = rawText.match(/___СЦЕНАРИЙ___\s*([\s\S]*?)\s*___КОНЕЦ_СЦЕНАРИЯ___/);
    if (match) {
      suggestedScript = match[1].trim();
    }

    const cleanReply = rawText
      .replace(/___СЦЕНАРИЙ___\s*[\s\S]*?\s*___КОНЕЦ_СЦЕНАРИЯ___/g, '')
      .trim();

    return res.status(200).json({
      success: true,
      reply: cleanReply || rawText.trim(),
      suggested_script: suggestedScript || undefined,
    });
  } catch (err) {
    console.error('scriptwriter chat error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Проверка схожести сценариев ──────────────────────────────────────────────

async function handleCheckSimilarity(req, res) {
  const { scripts } = req.body;
  if (!Array.isArray(scripts) || scripts.length < 2) {
    return res.status(400).json({ error: 'scripts: at least 2 items required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const parts = [`Проанализируй ${scripts.length} сценариев коротких видео и определи:
1. Насколько они СХОЖИ по структуре и формату? (0-100%)
2. Все ли они одного типа/формата?
3. Есть ли аутлайеры (сильно отличающиеся)?
4. Какие длины сценариев? Сильно ли различаются?

Ответ строго в JSON:
{
  "similarity_score": число от 0 до 100,
  "is_same_format": true/false,
  "outlier_indices": [индексы аутлайеров (0-based)] или [],
  "length_category": "same" | "mixed",
  "lengths": [длина каждого сценария в словах],
  "short_indices": [индексы коротких],
  "long_indices": [индексы длинных],
  "notes": "краткий комментарий"
}`];

  scripts.forEach((s, i) => {
    const text = s.transcript_text || s.script_text || '';
    parts.push(`\n--- Сценарий ${i + 1} ---\n${text.slice(0, 3000)}`);
  });

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      [{ role: 'user', content: parts.join('\n') }],
      { temperature: 0.1, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, ...parsed });
  } catch (err) {
    console.error('scriptwriter check-similarity error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Дообучение (refine) по текстовому фидбеку ───────────────────────────────

async function handleRefine(req, res) {
  const { prompt, script_text, feedback, structure_analysis } = req.body;
  if (!feedback?.trim() || !prompt?.trim()) {
    return res.status(400).json({ error: 'prompt and feedback are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const fb = feedback.trim();
  const isClarifyAnswer = fb.startsWith('Уточняющий вопрос:');
  const isTrainVerify = fb.includes('Ответы на уточняющие вопросы по обучению');

  const clarifyPreamble = isClarifyAnswer
    ? 'Пользователь ответил на твой уточняющий вопрос. Если подтвердил — примени. Если отверг — не меняй. clarifying_questions: []\n\n'
    : isTrainVerify
    ? 'Пользователь ответил на уточняющие вопросы после обучения. Примени изменения. clarifying_questions: []\n\n'
    : '';

  const instructions = isClarifyAnswer || isTrainVerify
    ? 'Примени изменения на основе ответов. clarifying_questions: []'
    : `1. Разбери обратную связь.
2. Если только ДОБАВЛЯЕШЬ правила — добавь и верни обновлённый prompt.
3. Если УДАЛЯЕШЬ/МЕНЯЕШЬ правило — добавь clarifying_questions для верификации и верни prompt БЕЗ изменений.`;

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription}`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    structureHint += '\n';
  }

  const userText = `${clarifyPreamble}Ты дообучаешь промт ИИ-сценариста.

ТЕКУЩИЙ ПРОМТ:
---
${prompt.trim()}
---
${structureHint}
${script_text ? `СГЕНЕРИРОВАННЫЙ СЦЕНАРИЙ:\n${script_text.trim()}\n` : ''}
ОБРАТНАЯ СВЯЗЬ:
«${fb}»

ИНСТРУКЦИИ:
${instructions}

Верни только валидный JSON:
{
  "prompt": "обновлённый промт",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": []
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: newPrompt,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      clarifying_questions: clarifying_questions.slice(0, 3),
    });
  } catch (err) {
    console.error('scriptwriter refine error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Дообучение (refine) по правкам пользователя (diff) ───────────────────────

async function handleRefineByDiff(req, res) {
  const { prompt, script_ai, script_human, feedback, structure_analysis } = req.body;
  if (!prompt?.trim() || script_ai == null || script_human == null) {
    return res.status(400).json({ error: 'prompt, script_ai and script_human are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const a = String(script_ai).trim().split(/\n/).filter(Boolean);
  const b = String(script_human).trim().split(/\n/).filter(Boolean);
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((line) => !setA.has(line));
  const removed = a.filter((line) => !setB.has(line));

  const diffHint = added.length > 0 || removed.length > 0
    ? `\nПОДСКАЗКА (diff):\nДобавлено: ${added.slice(0, 15).join(' | ') || '—'}\nУбрано: ${removed.slice(0, 15).join(' | ') || '—'}`
    : '';

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription}`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы: ${structure_analysis.bodyPhases.join(' → ')}`;
    structureHint += '\n';
  }

  const userText = `Ты дообучаешь промт ИИ-сценариста по правкам.

ТЕКУЩИЙ ПРОМТ (сохрани все правила, добавь только новые):
---
${prompt.trim()}
---
${structureHint}
СЦЕНАРИЙ НЕЙРОСЕТИ:
---
${String(script_ai).trim()}
---

ИДЕАЛЬНЫЙ СЦЕНАРИЙ ПОЛЬЗОВАТЕЛЯ:
---
${String(script_human).trim()}
---
${feedback?.trim() ? `\nКОММЕНТАРИЙ:\n«${feedback.trim()}»\n` : ''}${diffHint}

Верни JSON:
{
  "changes_identified": ["что изменил 1", ...],
  "prompt": "обновлённый промт",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": []
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.2, response_format: { type: 'json_object' } }
    );

    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    const parsed = parseJsonResponse(rawText);
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });

    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];

    return res.status(200).json({
      success: true,
      prompt: newPrompt,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      clarifying_questions: clarifying_questions.slice(0, 3),
    });
  } catch (err) {
    console.error('scriptwriter refine-by-diff error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}
