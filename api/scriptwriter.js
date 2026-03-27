// Vercel Serverless — ИИ-сценарист: глубокий анализ структуры, генерация по теме/референсу, чат, проверка схожести.

import { callOpenRouter, MODELS, MODELS_FALLBACK } from '../lib/openRouter.js';
import { logApiCall } from '../lib/logApiCall.js';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = body.action;

  logApiCall({ apiName: 'openrouter', action: `scriptwriter-${action || 'unknown'}`, userId: body.userId, projectId: body.projectId });

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
    case 'clarify-topic':
      return handleClarifyTopic(req, res);
    case 'generate-hooks':
      return handleGenerateHooks(req, res);
    case 'generate-body':
      return handleGenerateBody(req, res);
    case 'assemble-script':
      return handleAssembleScript(req, res);
    case 'improve-script':
      return handleImproveScript(req, res);
    case 'quick-generate':
      return handleQuickGenerate(req, res);
    case 'analyze-carousel':
      return handleAnalyzeCarousel(req, res);
    default:
      return res.status(400).json({ error: 'Unknown action' });
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

// ── Шаг 1: Уточнение темы (3 вопроса) ───────────────────────────────────────

async function handleClarifyTopic(req, res) {
  const { prompt, topic, structure_analysis, reference_transcript } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) structureHint += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
  }

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ (транскрипт видео, который пользователь хочет адаптировать):\n---\n${reference_transcript.trim().slice(0, 3000)}\n---`
    : '';

  const userText = `Ты ИИ-сценарист. Пользователь хочет создать сценарий короткого видео (рилс/шортс).

ТВОЙ ПОДЧЕРК (промт):
---
${prompt.trim()}
---
${structureHint}${refHint}

ТЕМА ПОЛЬЗОВАТЕЛЯ: «${topic.trim()}»

Задай РОВНО 3 уточняющих вопроса, чтобы лучше понять что он хочет. Вопросы должны касаться:
1. СОДЕРЖАНИЕ — что конкретно будет раскрыто в видео, какой угол подачи
2. СТРУКТУРА — как построить тело сценария, какие повороты/фазы использовать
3. КОНЦОВКА — какой финал/CTA/перегон, какую эмоцию оставить

Каждый вопрос должен предлагать 2-3 варианта ответа, исходя из твоего подчерка.

Ответ строго в JSON:
{
  "questions": [
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2", "вариант 3"] },
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2"] },
    { "question": "текст вопроса", "options": ["вариант 1", "вариант 2", "вариант 3"] }
  ]
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.FLASH, MODELS.FLASH_3],
      [{ role: 'user', content: userText }],
      { temperature: 0.4, response_format: { type: 'json_object' } }
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, questions: parsed.questions || [] });
  } catch (err) {
    console.error('scriptwriter clarify-topic error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 2: Генерация 5 вариантов хуков ──────────────────────────────────────

async function handleGenerateHooks(req, res) {
  const { prompt, topic, answers, structure_analysis, reference_transcript, feedback, previous_hooks } = req.body;
  if (!prompt?.trim() || !topic?.trim()) {
    return res.status(400).json({ error: 'prompt and topic are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.hookDescription) structureHint += `\nХук: ${structure_analysis.hookDescription} (${structure_analysis.hookDuration || '?'})`;
    if (structure_analysis.specialFeatures?.length) structureHint += `\nОсобенности: ${structure_analysis.specialFeatures.join(', ')}`;
  }

  const answersText = Array.isArray(answers) && answers.length
    ? '\n\nОТВЕТЫ ПОЛЬЗОВАТЕЛЯ НА УТОЧНЕНИЯ:\n' + answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '';

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ:\n${reference_transcript.trim().slice(0, 2000)}`
    : '';

  let feedbackHint = '';
  if (feedback?.trim() && Array.isArray(previous_hooks) && previous_hooks.length) {
    feedbackHint = `\n\nПРЕДЫДУЩИЕ ХУКИ (пользователю не понравились):\n${previous_hooks.map((h, i) => `${i + 1}. ${typeof h === 'string' ? h : h.text || ''}`).join('\n')}\n\nОБРАТНАЯ СВЯЗЬ: «${feedback.trim()}»\n\nСгенерируй НОВЫЕ хуки, учитывая фидбек. НЕ повторяй предыдущие.`;
  }

  const userText = `Ты ИИ-сценарист коротких видео (рилсы/шортсы).

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}

ТЕМА: «${topic.trim()}»${answersText}${refHint}${feedbackHint}

Сгенерируй РОВНО 5 разных вариантов ХУКОВ (первые 1-3 предложения сценария, которые цепляют внимание).
Каждый хук должен быть в стиле подчерка, но с разным подходом к привлечению внимания.

Ответ строго в JSON:
{
  "hooks": [
    { "text": "полный текст хука", "approach": "краткое описание подхода в 3-5 слов" },
    ...
  ]
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.6, response_format: { type: 'json_object' } }
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, hooks: parsed.hooks || [] });
  } catch (err) {
    console.error('scriptwriter generate-hooks error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 3: Генерация 3 вариантов тела ───────────────────────────────────────

async function handleGenerateBody(req, res) {
  const { prompt, topic, answers, selected_hook, structure_analysis, reference_transcript, feedback, previous_bodies } = req.body;
  if (!prompt?.trim() || !topic?.trim() || !selected_hook?.trim()) {
    return res.status(400).json({ error: 'prompt, topic and selected_hook are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\n\nСТРУКТУРА ПОДЧЕРКА:';
    if (structure_analysis.bodyPhases?.length) structureHint += `\nФазы тела: ${structure_analysis.bodyPhases.join(' → ')}`;
    if (structure_analysis.ctaType) structureHint += `\nCTA: ${structure_analysis.ctaType}`;
    if (structure_analysis.avgLengthSeconds) structureHint += `\nЦелевая длительность: ~${structure_analysis.avgLengthSeconds} сек`;
  }

  const answersText = Array.isArray(answers) && answers.length
    ? '\n\nОТВЕТЫ ПОЛЬЗОВАТЕЛЯ:\n' + answers.map((a, i) => `${i + 1}. ${a}`).join('\n')
    : '';

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ:\n${reference_transcript.trim().slice(0, 2000)}`
    : '';

  let feedbackHint = '';
  if (feedback?.trim() && Array.isArray(previous_bodies) && previous_bodies.length) {
    feedbackHint = `\n\nПРЕДЫДУЩИЕ ВАРИАНТЫ ТЕЛА (не понравились):\n${previous_bodies.map((b, i) => `${i + 1}. ${(typeof b === 'string' ? b : b.text || '').slice(0, 300)}`).join('\n')}\n\nОБРАТНАЯ СВЯЗЬ: «${feedback.trim()}»\n\nСгенерируй НОВЫЕ варианты, учитывая фидбек. НЕ повторяй предыдущие.`;
  }

  const userText = `Ты ИИ-сценарист коротких видео.

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}

ТЕМА: «${topic.trim()}»${answersText}${refHint}${feedbackHint}

ВЫБРАННЫЙ ХУК:
«${selected_hook.trim()}»

Сгенерируй РОВНО 3 разных варианта ТЕЛА сценария (основная часть после хука, включая CTA/концовку если нужно по подчерку).
Каждый вариант должен:
- Начинаться сразу после хука
- Следовать фазам из подчерка
- Иметь разный подход к раскрытию темы
- Включать CTA/перегон если есть в подчерке

Ответ строго в JSON:
{
  "bodies": [
    { "text": "полный текст тела + концовка", "approach": "краткое описание подхода в 3-5 слов" },
    ...
  ]
}`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, MODELS.FLASH],
      [{ role: 'user', content: userText }],
      { temperature: 0.6, response_format: { type: 'json_object' } }
    );
    if (!rawText) return res.status(502).json({ error: 'Empty response' });
    const parsed = parseJsonResponse(rawText);
    return res.status(200).json({ success: true, bodies: parsed.bodies || [] });
  } catch (err) {
    console.error('scriptwriter generate-body error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 4: Сборка финального сценария ────────────────────────────────────────

async function handleAssembleScript(req, res) {
  const { prompt, topic, answers, selected_hook, selected_body, structure_analysis } = req.body;
  if (!prompt?.trim() || !selected_hook?.trim() || !selected_body?.trim()) {
    return res.status(400).json({ error: 'prompt, selected_hook and selected_body are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  let structureHint = '';
  if (structure_analysis) {
    structureHint = '\nСТРУКТУРА: ';
    if (structure_analysis.hookDuration) structureHint += `хук ~${structure_analysis.hookDuration}, `;
    if (structure_analysis.bodyPhases?.length) structureHint += `фазы: ${structure_analysis.bodyPhases.join(' → ')}, `;
    if (structure_analysis.ctaType) structureHint += `CTA: ${structure_analysis.ctaType}`;
  }

  const userText = `Ты ИИ-сценарист. Собери финальный сценарий из выбранных частей.

ПОДЧЕРК:
---
${prompt.trim()}
---
${structureHint}

ТЕМА: «${(topic || '').trim()}»

ХУК (выбран пользователем):
${selected_hook.trim()}

ТЕЛО + КОНЦОВКА (выбрано пользователем):
${selected_body.trim()}

Задача: соедини хук и тело в единый гладкий сценарий. Убери швы между частями. Сохрани стиль подчерка. Если нужно — немного отредактируй для плавности, но не меняй смысл и структуру.

Выводи ТОЛЬКО текст финального сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: prompt.trim() },
        { role: 'user', content: userText },
      ],
      { temperature: 0.3 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter assemble-script error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Шаг 5: Улучшение сценария по комментариям ───────────────────────────────

async function handleImproveScript(req, res) {
  const { prompt, script_text, feedback, structure_analysis } = req.body;
  if (!prompt?.trim() || !script_text?.trim() || !feedback?.trim()) {
    return res.status(400).json({ error: 'prompt, script_text and feedback are required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const userText = `Ты ИИ-сценарист. Улучши сценарий по комментариям пользователя.

ПОДЧЕРК:
---
${prompt.trim()}
---

ТЕКУЩИЙ СЦЕНАРИЙ:
---
${script_text.trim()}
---

КОММЕНТАРИЙ ПОЛЬЗОВАТЕЛЯ:
«${feedback.trim()}»

Задача: учти комментарий и выведи УЛУЧШЕННЫЙ сценарий. Сохрани стиль подчерка. Выводи ТОЛЬКО текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      MODELS_FALLBACK,
      [
        { role: 'system', content: prompt.trim() },
        { role: 'user', content: userText },
      ],
      { temperature: 0.4 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter improve-script error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ── Быстрая генерация: тема → сразу полный сценарий ──────────────────────────

async function handleQuickGenerate(req, res) {
  const { prompt, topic, structure_analysis, reference_transcript } = req.body;
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

  const refHint = reference_transcript?.trim()
    ? `\n\nРЕФЕРЕНС-СЦЕНАРИЙ (адаптируй под тему):\n${reference_transcript.trim().slice(0, 3000)}`
    : '';

  const userText = `Тема/идея для сценария:\n${topic.trim()}${refHint}\n\nНапиши полный сценарий по этой теме, строго следуя стилю и структуре из промта. Включи яркий хук, основное тело с фазами, и CTA если предусмотрен подчерком. Выводи только текст сценария, без пояснений.`;

  try {
    const rawText = await callWithFallback(
      [MODELS.PRO_3, ...MODELS_FALLBACK],
      [
        { role: 'system', content: systemText },
        { role: 'user', content: userText },
      ],
      { temperature: 0.5 }
    );
    if (!rawText?.trim()) return res.status(502).json({ error: 'Empty response' });
    return res.status(200).json({ success: true, script: rawText.trim() });
  } catch (err) {
    console.error('scriptwriter quick-generate error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

// ─── analyze-carousel ─────────────────────────────────────────────────────────
// Принимает base64-картинку слайда карусели, возвращает JSON с фоном и элементами.

async function handleAnalyzeCarousel(req, res) {
  const { image_data, mime_type = 'image/jpeg' } = req.body;

  if (!image_data) return res.status(400).json({ error: 'image_data required' });

  const prompt = `Ты дизайн-аналитик. Проанализируй слайд карусели Instagram и верни ТОЛЬКО валидный JSON без markdown.

Формат ответа:
{
  "background": {
    "type": "solid",
    "color": "#1a1a18"
  },
  "elements": [
    {
      "type": "text",
      "text": "точный текст блока",
      "x": 8, "y": 8,
      "fontSize": 72,
      "fontWeight": 700,
      "color": "#ffffff",
      "textAlign": "left",
      "width": 82,
      "fontFamily": "serif",
      "fontStyle": "normal",
      "rotation": 0,
      "lineHeight": 1.2,
      "letterSpacing": 0
    },
    {
      "type": "placeholder",
      "x": 10, "y": 40,
      "width": 80, "height": 35,
      "label": "Фото",
      "borderRadius": 16
    }
  ]
}

Правила для background:
- type="solid" ТОЛЬКО если фон — чистый однородный цвет как цифровой прямоугольник (#ffffff, #000000, #3a7bd5). color=точный hex.
- type="gradient" если есть плавный цифровой переход между двумя цветами, без какой-либо физической текстуры. from, to, direction.
- type="image" во ВСЕХ остальных случаях: любое зерно, шум, плёнка, бумага, ткань, стена, бетон, кожа, паттерн, фото, люди, комнаты, природа — любой фон который выглядит как физический материал или реальная фотография. Если сомневаешься — выбирай type="image".

Правила для текстовых элементов:
- Точно скопируй текст (важно!).
- СМЕШАННЫЙ СТИЛЬ В ОДНОЙ СТРОКЕ: если часть текста в строке обычная, а часть курсивная (например "Shots for *All Your*") — создай ДВА отдельных элемента с точными x координатами. Первый: обычный текст до курсива. Второй: курсивный текст, fontStyle="italic". Рассчитай x второго элемента исходя из ширины первого.
- РАЗНЫЕ БЛОКИ: если слова/фразы разного размера или на разных уровнях — каждый = отдельный элемент.
- x, y — координаты верхнего левого угла в % от ширины/высоты слайда. x=0 — левый край, x=50 — центр, x=100 — правый. y=0 — верх, y=100 — низ. ВАЖНО: следи чтобы text-элементы и placeholder не перекрывались — они должны идти последовательно по Y.
- fontSize — как если бы слайд 1080px шириной (диапазон 24-200). Для огромных заголовков используй 120-200.
- fontWeight: 400 (обычный), 700 (жирный), 900 (ультражирный/black).
- fontFamily: "serif" если шрифт с засечками (Playfair, Times, Georgia-style), "sans-serif" если без засечек средней толщины, "heavy-sans" если очень толстый/тяжёлый sans-serif (Montserrat Black), "display" если декоративный/капительный/condensed (Bebas Neue, ALL CAPS), "italic-serif" если курсивный с засечками, "monospace" если моноширинный (код, терминал).
- fontStyle: "italic" если текст курсивный, иначе "normal".
- rotation: угол наклона в градусах (-45 до 45). 0 если прямой.
- lineHeight: межстрочный интервал (1.0-1.8).
- letterSpacing: межбуквенный интервал в em (-0.05 до 0.3).
- width — ширина текстового блока в % от ширины слайда.
- Максимум 12 текстовых элементов.

Правила для placeholder:
- Для каждого фото/изображения/иконки добавь type="placeholder".
- ГРИД ФОТО: если фото расположены в сетке (2x2, 3x2 и т.д.) — точно воспроизведи позиции каждого. Убедись что y-координаты фото НЕ перекрываются с текстом выше.
- width и height в % от размеров слайда.
- borderRadius: 0 если прямоугольник, 8-32 если скруглённые углы, 50 если круг.

Правила для фигур (shapes):
- КОД-БЛОК (тёмный прямоугольник с моноширинным текстом): type="shape", shapeType="rect", fill=тёмный цвет (например "#1a1a1a"), плюс отдельный text-элемент поверх с fontFamily="monospace", color="#ffffff" или "#00ff00".
- Для линий: type="shape", shapeType="line", height=0.3-1%.
- Для стрелок (→, ↓, curved arrow): type="shape", shapeType="arrow".
- Для прямоугольников/рамок: type="shape", shapeType="rect", borderRadius=0.
- Для овала/pill/кнопки: type="shape", shapeType="rect", borderRadius=999. Добавь text поверх.
- Для кружков: type="shape", shapeType="circle".
- fill — цвет заливки (hex или "transparent"), stroke — цвет обводки, strokeWidth — толщина (1-8).
- Не игнорируй фигуры — стрелки, рамки, кнопки, код-блоки!

Верни ТОЛЬКО JSON, без пояснений, без markdown.`;

  // Модели с поддержкой vision (по приоритету)
  const VISION_MODELS = [
    'google/gemini-2.5-pro-preview',
    'google/gemini-2.5-flash-preview',
    'google/gemini-2.0-flash-001',
  ];

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_data}` } },
        { type: 'text', text: prompt },
      ],
    },
  ];

  // ── Шаг 1: основной анализ ──────────────────────────────────
  let parsed = null;
  let lastErr = null;
  for (const model of VISION_MODELS) {
    try {
      const { text } = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature: 0.1,
        max_tokens: 1400,
      });
      if (!text) continue;
      parsed = parseJsonResponse(text);
      break;
    } catch (err) {
      console.error(`analyze-carousel step1 error with ${model}:`, err.message);
      lastErr = err;
      if (err.message?.includes('429')) await new Promise(r => setTimeout(r, 1500));
    }
  }

  if (!parsed) {
    return res.status(502).json({ error: lastErr?.message ?? 'Vision API error' });
  }

  // ── Шаг 2: ВСЕГДА генерируем фон через gemini-2.5-flash-image ───────────────────────────
  // Используем stream:true + modalities — без них модель возвращает content:null и 0 изображений
  try {
    const genRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ririrai.vercel.app',
        'X-Title': 'RiRi AI',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image',
        modalities: ['image', 'text'],
        stream: true,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mime_type};base64,${image_data}` } },
            { type: 'text', text: 'я прикрепил тебе фото. удали на нем все текста, блоки с фото, точки, все, кроме фона.\n\nсохрани точь в точь фон и дай мне только его. сохрани цвет, текстуру, палитру точь в точь.\n\nесли фоном является фото - создай это же фото.\n\nсделай фото размером 3 на 4.' },
          ],
        }],
      }),
    });

    console.log('Gemini image gen HTTP status:', genRes.status);

    const rawText = await genRes.text();
    const lines = rawText.split('\n');

    let base64Chunks = [];
    let imageMime = 'image/png';

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const delta = chunk?.choices?.[0]?.delta;
        // Вариант 1: delta.images[]
        if (delta?.images?.length > 0) {
          const url = delta.images[0]?.image_url?.url;
          if (url?.startsWith('data:')) {
            const [meta, b64] = url.split(',');
            const mime = meta.replace('data:', '').replace(';base64', '');
            if (mime) imageMime = mime;
            if (b64) base64Chunks.push(b64);
          }
        }
        // Вариант 2: delta.content как массив
        if (Array.isArray(delta?.content)) {
          for (const part of delta.content) {
            if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:')) {
              const [meta, b64] = part.image_url.url.split(',');
              const mime = meta.replace('data:', '').replace(';base64', '');
              if (mime) imageMime = mime;
              if (b64) base64Chunks.push(b64);
            }
          }
        }
      } catch {}
    }

    console.log('Gemini SSE chunks:', lines.filter(l => l.startsWith('data:')).length, '| base64 parts:', base64Chunks.length);

    if (base64Chunks.length > 0) {
      const fullBase64 = base64Chunks.join('');
      parsed.background = { type: 'image', src: `data:${imageMime};base64,${fullBase64}` };
      console.log('Gemini: background generated OK, base64 length:', fullBase64.length);
    } else {
      console.warn('Gemini image gen: no image found. Raw preview:', rawText.slice(0, 800));
    }
  } catch (err) {
    console.error('Gemini image gen error:', err.message);
  }

  return res.status(200).json(parsed);
}
