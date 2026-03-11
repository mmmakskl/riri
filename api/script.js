// Vercel Serverless — стиль сценария: анализ примеров ИЛИ генерация по промту (OpenRouter/Gemini).

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
  const hasExamples = Array.isArray(body.examples) && body.examples.length > 0;
  const hasGenerate = body.prompt && typeof body.transcript_text === 'string' && !body.feedback;
  const hasRefine = body.feedback && typeof body.prompt === 'string' && typeof body.transcript_text === 'string' && typeof body.script_text === 'string';
  const hasRefineByDiff = body.script_ai != null && body.script_human != null && typeof body.prompt === 'string' && typeof body.transcript_text === 'string';
  const hasChat = body.action === 'chat' && Array.isArray(body.messages) && body.messages.length > 0 && typeof body.prompt === 'string';

  const scriptAction = hasExamples ? 'script-analyze' : hasRefineByDiff ? 'script-refine-diff' : hasRefine ? 'script-refine' : hasGenerate ? 'script-generate' : hasChat ? 'script-chat' : 'script-unknown';
  logApiCall({ apiName: 'openrouter', action: scriptAction, userId: body.userId, projectId: body.projectId, metadata: { examplesCount: body.examples?.length } });

  if (hasExamples) return handleAnalyze(req, res);
  if (hasRefineByDiff) return handleRefineByDiff(req, res);
  if (hasRefine) return handleRefine(req, res);
  if (hasGenerate) return handleGenerate(req, res);
  if (hasChat) return handleChat(req, res);
  return res.status(400).json({
    error: 'Use examples[] (analyze), prompt+transcript_text (generate), feedback+script_text (refine), script_ai+script_human (refine by diff), or action:chat+messages[] (chat)',
  });
}

async function handleAnalyze(req, res) {
  const { examples } = req.body;
  if (examples.length > 10) {
    return res.status(400).json({ error: 'examples: max 10 items' });
  }
  for (const ex of examples) {
    if (!ex.transcript_text || !ex.script_text) {
      return res.status(400).json({
        error: 'Each example must have transcript_text and script_text.',
      });
    }
  }

  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const parts = [];
  parts.push(`Задача: по примерам адаптации сценариев выявить ПРАВИЛА и ЗАКОНОМЕРНОСТИ, а не смыслы.

У тебя есть примеры. В каждом примере:
1) Исходный сценарий (оригинал, транскрипт)
2) Перевод на русский (если есть)
3) Моя адаптация — как я переписал сценарий

КРИТИЧНО:
— НЕ запоминай конкретные смыслы, идеи, факты из примеров. Они уникальны для каждого видео.
— ВЫЯВИ ПРАВИЛА: как я структурирую, как сокращаю, как добавляю хуки, какой тон, какие типовые трансформации (оригинал → моя версия).
— Промт должен описывать КАК переписывать любой новый исходник, а не ЧТО писать. Универсальные правила, применимые к новым сценариям.

Нужно:
— сравнить оригинал и мою адаптацию: что изменилось по форме, структуре, подаче;
— зафиксировать правила (логика, стиль, структура, типовые трансформации);
— сформулировать один рабочий промт для генерации новых сценариев по новым исходникам.

После создания промта сформулируй 3–5 уточняющих вопросов о ключевых предположениях. Формат: «Правильно ли я понимаю, что ...?» Например: от лица кого пишем текст, хук меняем или оставляем, какая структура, тон. Эти вопросы помогут пользователю подтвердить или скорректировать понимание.

Ответ пришли строго в формате JSON без markdown-блоков и без лишнего текста. Один валидный JSON: без запятой перед закрывающей скобкой, переносы в строках только как \\n.
{
  "prompt": "полный текст промта для нейросети (на русском)",
  "meta": {
    "rules": ["правило 1", "правило 2", ...],
    "doNot": ["чего избегать", ...],
    "summary": "краткое описание стиля в 1–2 предложения"
  },
  "clarifying_questions": ["Правильно ли я понимаю, что ...?", "Правильно ли я понимаю, что ...?", ...]
}
`);

  examples.forEach((ex, i) => {
    parts.push(`\n--- Пример ${i + 1} ---\n`);
    parts.push(`Исходный сценарий (оригинал):\n${ex.transcript_text}\n`);
    if (ex.translation_text && ex.translation_text.trim()) {
      parts.push(`Перевод на русский:\n${ex.translation_text}\n`);
    }
    parts.push(`Моя адаптация (сравни с оригиналом — какие правила применил):\n${ex.script_text}\n`);
  });

  const analyzeModels = [MODELS.PRO_3, MODELS.FLASH];
  let rawText = null;
  for (const model of analyzeModels) {
    try {
      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages: [{ role: 'user', content: parts.join('') }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      rawText = result.text;
      if (rawText) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  try {
    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        try {
          parsed = JSON.parse(jsonStr.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, '$1'));
        } catch (_) {
          throw parseErr;
        }
      } else {
        throw parseErr;
      }
    }
    const promptText = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];
    if (!promptText) return res.status(502).json({ error: 'Invalid JSON structure' });
    return res.status(200).json({
      success: true,
      prompt: promptText,
      meta: {
        rules: Array.isArray(meta.rules) ? meta.rules : [],
        doNot: Array.isArray(meta.doNot) ? meta.doNot : [],
        summary: typeof meta.summary === 'string' ? meta.summary : '',
      },
      clarifying_questions: clarifying_questions.slice(0, 6),
    });
  } catch (err) {
    console.error('script analyze error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

async function handleGenerate(req, res) {
  const { prompt, transcript_text, translation_text } = req.body;
  if (!prompt.trim()) return res.status(400).json({ error: 'prompt is required' });
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const userParts = [];
  userParts.push('Исходный сценарий (оригинал):\n' + transcript_text.trim());
  if (translation_text && typeof translation_text === 'string' && translation_text.trim()) {
    userParts.push('\nПеревод на русский:\n' + translation_text.trim());
  }
  userParts.push('\n\nСгенерируй мой сценарий (адаптацию) по этим данным. Выводи только текст сценария, без пояснений.');
  let userText = userParts.join('');
  const MAX_CHARS = 100000;
  if (userText.length > MAX_CHARS) {
    userText = userText.slice(0, MAX_CHARS) + '\n\n[... текст обрезан из-за длины ...]';
  }

  const messages = [
    { role: 'system', content: prompt.trim() },
    { role: 'user', content: userText },
  ];

  let lastErr = null;
  for (const model of MODELS_FALLBACK) {
    try {
      const { text: script } = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages,
        temperature: 0.4,
      });
      if (script && script.trim()) return res.status(200).json({ success: true, script: script.trim() });
    } catch (err) {
      lastErr = err.message;
      if (err.message?.includes('429')) {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  const errMsg =
    lastErr?.includes('429')
      ? 'Лимит OpenRouter API исчерпан. Попробуйте позже.'
      : 'OpenRouter returned empty script. Try again or shorten the transcript.';
  return res.status(502).json({ error: errMsg });
}

async function handleRefine(req, res) {
  const { prompt, transcript_text, translation_text, script_text, feedback } = req.body;
  if (!feedback || typeof feedback !== 'string' || !feedback.trim()) {
    return res.status(400).json({ error: 'feedback is required' });
  }
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const fb = feedback.trim();
  const isClarifyAnswer = fb.startsWith('Уточняющий вопрос:');
  const isTrainVerify = fb.includes('Ответы на уточняющие вопросы по обучению');
  const clarifyPreamble = isClarifyAnswer
    ? `Пользователь ответил на твой уточняющий вопрос. Если он подтвердил (да, можно, правильно) — примени изменение. Если отверг (нет, оставь) — не меняй промт. Если уточнил иначе — учти его ответ. clarifying_questions оставь пустым.\n\n`
    : isTrainVerify
    ? `Пользователь прошёл этап верификации после обучения. Ниже — его ответы на уточняющие вопросы по промту. Примени изменения: если подтвердил — закрепи в промте; если скорректировал — учти правку; если пропустил — оставь как есть. clarifying_questions: []\n\n`
    : '';

  const instructions = isClarifyAnswer || isTrainVerify
    ? 'Примени изменения на основе ответов пользователя. clarifying_questions: []'
    : `1. Разбери обратную связь: к чему КОНКРЕТНО она относится?
2. Если хочешь только ДОБАВИТЬ новые правила — сделай это, верни обновлённый prompt.
3. Если хочешь УДАЛИТЬ или ИЗМЕНИТЬ существующее правило — ОБЯЗАТЕЛЬНО добавь в clarifying_questions вопрос для верификации. Формат: «Правильно ли я понимаю, что [правило X] можно удалить?» или «Можно ли заменить [правило X] на [Y]?» В таком случае верни prompt БЕЗ изменений — изменение применим после подтверждения.
4. clarifying_questions — массив из 1–2 вопросов. Без них не удаляй и не меняй правила.`;

  const userText = `${clarifyPreamble}Ты дообучаешь промт для генерации сценариев.

ТЕКУЩИЙ ПРОМТ:
---
${prompt.trim()}
---

КОНТЕКСТ:
Исходный сценарий (оригинал):
${transcript_text.trim()}
${translation_text && translation_text.trim() ? '\nПеревод на русский:\n' + translation_text.trim() : ''}

Сгенерированный сценарий (то, что не устроило пользователя):
${script_text.trim()}

ОБРАТНАЯ СВЯЗЬ ПОЛЬЗОВАТЕЛЯ:
«${feedback.trim()}»

ИНСТРУКЦИИ:
${instructions}

Верни только валидный JSON. Переносы в строках — только \\n.
{
  "prompt": "обновлённый промт",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": []
}
Когда это ответ на уточняющий вопрос — clarifying_questions пустой. Иначе — добавь вопросы для верификации, если хочешь удалить/изменить правило.`;

  const refineModels = [MODELS.PRO_3, MODELS.FLASH];
  let rawText = null;
  for (const model of refineModels) {
    try {
      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages: [{ role: 'user', content: userText }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      rawText = result.text;
      if (rawText) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  try {
    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        try {
          parsed = JSON.parse(jsonStr.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, '$1'));
        } catch (_) {
          throw parseErr;
        }
      } else {
        throw parseErr;
      }
    }
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });
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
    console.error('script refine error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

/** Простой diff: что добавлено/убрано между двумя текстами */
function computeSimpleDiff(before, after) {
  const a = String(before).trim().split(/\n/).filter(Boolean);
  const b = String(after).trim().split(/\n/).filter(Boolean);
  const setA = new Set(a);
  const setB = new Set(b);
  const added = b.filter((line) => !setA.has(line));
  const removed = a.filter((line) => !setB.has(line));
  return { added, removed };
}

async function handleRefineByDiff(req, res) {
  const { prompt, transcript_text, translation_text, script_ai, script_human, feedback } = req.body;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const { added, removed } = computeSimpleDiff(script_ai, script_human);
  const diffHint =
    added.length > 0 || removed.length > 0
      ? `\n\nПОДСКАЗКА (строки, которые пользователь добавил/убрал):\nДобавлено: ${added.slice(0, 15).join(' | ') || '—'}\nУбрано: ${removed.slice(0, 15).join(' | ') || '—'}`
      : '';

  const userText = `Ты дообучаешь промт по правкам пользователя. Нейросеть сгенерировала сценарий, пользователь отредактировал его. Нужно понять КОНКРЕТНО что изменилось и добавить правила в промт.

ТЕКУЩИЙ ПРОМТ (ОБЯЗАТЕЛЬНО сохрани все правила и смыслы, добавь только новые уточнения):
---
${prompt.trim()}
---

КОНТЕКСТ — исходник:
${transcript_text.trim()}
${translation_text && String(translation_text).trim() ? '\nПеревод:\n' + String(translation_text).trim() : ''}

СЦЕНАРИЙ НЕЙРОСЕТИ (до правок):
---
${String(script_ai).trim()}
---

ИДЕАЛЬНЫЙ СЦЕНАРИЙ ПОЛЬЗОВАТЕЛЯ (после правок):
---
${String(script_human).trim()}
---
${feedback && String(feedback).trim() ? `\nДОПОЛНИТЕЛЬНЫЙ КОММЕНТАРИЙ ПОЛЬЗОВАТЕЛЯ:\n«${String(feedback).trim()}»\n` : ''}
${diffHint}

ИНСТРУКЦИИ:
1. Сравни два сценария построчно. Выпиши в changes_identified: что пользователь ДОБАВИЛ, что УБРАЛ, что ИЗМЕНИЛ.
2. Если хочешь только ДОБАВИТЬ новые правила — сделай это, верни обновлённый prompt.
3. Если хочешь УДАЛИТЬ или ИЗМЕНИТЬ существующее правило — ОБЯЗАТЕЛЬНО добавь в clarifying_questions вопрос для верификации. Формат: «Правильно ли я понимаю, что [правило X] можно удалить?» или «Можно ли заменить [правило X] на [Y]?» В таком случае верни prompt БЕЗ изменений — изменение применим после подтверждения.
4. clarifying_questions — массив из 1–2 вопросов. Без них не удаляй и не меняй правила.

Верни только валидный JSON. Переносы в строках — только \\n.
{
  "changes_identified": ["что изменил пользователь 1", "что изменил 2", ...],
  "prompt": "обновлённый промт (при добавлении) или текущий без изменений (при удалении/изменении)",
  "meta": { "rules": [...], "doNot": [...], "summary": "..." },
  "clarifying_questions": ["вопрос для верификации, если хочешь удалить/изменить правило"]
}`;

  const refineByDiffModels = [MODELS.PRO_3, MODELS.FLASH];
  let rawText = null;
  for (const model of refineByDiffModels) {
    try {
      const result = await callOpenRouter({
        apiKey: OPENROUTER_API_KEY,
        model,
        messages: [{ role: 'user', content: userText }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
      rawText = result.text;
      if (rawText) break;
    } catch (err) {
      if (err.message?.includes('429')) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  try {
    if (!rawText) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let jsonStr = (rawText.match(/\{[\s\S]*\}/) || [null])[0] || rawText;
    jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      const lastBrace = jsonStr.lastIndexOf('}');
      if (lastBrace > 0) {
        try {
          parsed = JSON.parse(jsonStr.slice(0, lastBrace + 1).replace(/,(\s*[}\]])/g, '$1'));
        } catch (_) {
          throw parseErr;
        }
      } else {
        throw parseErr;
      }
    }
    const newPrompt = typeof parsed.prompt === 'string' ? parsed.prompt : '';
    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const clarifying_questions = Array.isArray(parsed.clarifying_questions)
      ? parsed.clarifying_questions.filter((q) => typeof q === 'string' && q.trim())
      : [];
    if (!newPrompt) return res.status(502).json({ error: 'Invalid JSON structure' });
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
    console.error('script refineByDiff error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}

/** Чат с нейронкой для доработки промта: многораундовый диалог */
async function handleChat(req, res) {
  const { messages, prompt, transcript_text, translation_text, script_text } = req.body;
  if (!OPENROUTER_API_KEY) return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });

  const systemParts = [
    'Ты помощник по доработке промта для генерации сценариев видео. Пользователь хочет улучшить промт, чтобы нейросеть генерировала сценарии в нужном стиле.',
    '',
    'Текущий промт:',
    '---',
    prompt.trim(),
    '---',
    '',
  ];
  if (transcript_text && transcript_text.trim()) {
    systemParts.push('Контекст — исходник видео (оригинал):');
    systemParts.push(transcript_text.trim().slice(0, 1500) + (transcript_text.length > 1500 ? '...' : ''));
    systemParts.push('');
  }
  if (translation_text && translation_text.trim()) {
    systemParts.push('Перевод на русский (фрагмент):');
    systemParts.push(translation_text.trim().slice(0, 800) + (translation_text.length > 800 ? '...' : ''));
    systemParts.push('');
  }
  if (script_text && script_text.trim()) {
    systemParts.push('Текущий сценарий (сгенерированный или редактируемый):');
    systemParts.push(script_text.trim().slice(0, 1000) + (script_text.length > 1000 ? '...' : ''));
    systemParts.push('');
  }
  systemParts.push('Отвечай на русском. Можешь предлагать конкретные правки промта — тогда в конце ответа добавь блок в формате:');
  systemParts.push('___ОБНОВЛЁННЫЙ_ПРОМТ___');
  systemParts.push('(полный текст нового промта)');
  systemParts.push('___КОНЕЦ_ПРОМТ___');
  systemParts.push('Если правки не нужны — не добавляй этот блок.');

  const chatMessages = [
    { role: 'system', content: 'Ты помощник по доработке промта для генерации сценариев. Отвечай на русском. Можешь предлагать правки — добавляй блок ___ОБНОВЛЁННЫЙ_ПРОМТ___ (текст) ___КОНЕЦ_ПРОМТ___' },
    { role: 'user', content: systemParts.join('\n') },
    { role: 'assistant', content: 'Понял. Жду твои пожелания по промту — что изменить, добавить, убрать. Отвечу и при необходимости предложу обновлённый вариант.' },
  ];

  for (const m of messages) {
    if (m.role === 'user' && m.content?.trim()) {
      chatMessages.push({ role: 'user', content: String(m.content).trim() });
    } else if (m.role === 'assistant' && m.content?.trim()) {
      chatMessages.push({ role: 'assistant', content: String(m.content).trim() });
    }
  }

  try {
    const { text: reply } = await callOpenRouter({
      apiKey: OPENROUTER_API_KEY,
      model: MODELS.FLASH,
      messages: chatMessages,
      temperature: 0.5,
    });
    if (!reply) return res.status(502).json({ error: 'OpenRouter returned empty response' });

    let suggestedPrompt = null;
    const match = reply.match(/___ОБНОВЛЁННЫЙ_ПРОМТ___\s*([\s\S]*?)\s*___КОНЕЦ_ПРОМТ___/);
    if (match) {
      suggestedPrompt = match[1].trim();
      const cleanReply = reply.replace(/___ОБНОВЛЁННЫЙ_ПРОМТ___\s*[\s\S]*?\s*___КОНЕЦ_ПРОМТ___/g, '').trim();
      return res.status(200).json({
        success: true,
        reply: cleanReply,
        suggested_prompt: suggestedPrompt || undefined,
      });
    }

    return res.status(200).json({
      success: true,
      reply,
      suggested_prompt: suggestedPrompt || undefined,
    });
  } catch (err) {
    console.error('script chat error:', err);
    return res.status(502).json({ error: 'OpenRouter API error', details: err.message });
  }
}
