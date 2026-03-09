/**
 * Стоимость действий в коинах R.
 * Отображается в UI как коины с иконкой R.
 * 1 коин ≈ 0,1 ₽ трат на API (RapidAPI, Gemini).
 * AssemblyAI не учитывается (бесплатный тариф).
 */

export type TokenAction =
  | 'search'
  | 'link_add'
  | 'radar_add_profile'
  | 'radar_refresh_all'
  | 'add_carousel'
  | 'load_video'
  | 'translate'
  | 'generate_script'
  | 'refine_prompt'
  | 'chat_with_prompt'
  | 'calculate_viral'
  | 'transcribe_video'
  | 'transcribe_carousel'
  | 'train_style'
  | 'add_to_folder'
  | 'sw_clarify'
  | 'sw_hooks'
  | 'sw_body'
  | 'sw_assemble'
  | 'sw_improve'
  | 'sw_validate_reel'
  | 'sw_quick'
  | 'analytics_sync_12'
  | 'analytics_sync_24'
  | 'analytics_sync_36'
  | 'analytics_sync_48'
  | 'analytics_sync_60';

/** Базовые стоимости в коинах */
const TOKEN_COSTS: Record<Exclude<TokenAction, 'radar_refresh_all'>, number> = {
  search: 10,           // 2–6 RapidAPI запросов, ~1 ₽
  link_add: 2,          // 1–2 RapidAPI
  radar_add_profile: 5, // 2 RapidAPI user-reels
  add_carousel: 2,      // 1 RapidAPI reel-info
  load_video: 2,        // 1 RapidAPI download-video
  translate: 1,         // 1 Gemini
  generate_script: 5,   // 1–2 Gemini
  refine_prompt: 5,     // 1 Gemini
  chat_with_prompt: 5,  // 1 Gemini
  calculate_viral: 2,  // 1 RapidAPI user-reels
  transcribe_video: 2,  // 1 RapidAPI (AssemblyAI бесплатно)
  transcribe_carousel: 2, // 1 Gemini
  train_style: 5, // 1 Gemini (анализ примеров)
  add_to_folder: 0,
  sw_clarify: 3,        // 1 Gemini — уточнение темы
  sw_hooks: 5,          // 1 Gemini — 5 вариантов хуков
  sw_body: 5,           // 1 Gemini — 3 варианта тела
  sw_assemble: 3,       // 1 Gemini — сборка финального сценария
  sw_improve: 5,        // 1 Gemini — улучшение по комментариям
  sw_validate_reel: 2,  // 1 RapidAPI — проверка рилса при обучении
  sw_quick: 8,          // 1-2 Gemini — полный сценарий за один запрос
  analytics_sync_12: 5,   // 1 RapidAPI страница (12 роликов)
  analytics_sync_24: 10,  // 2 RapidAPI страницы (24 ролика)
  analytics_sync_36: 15,  // 3 RapidAPI страницы (36 роликов)
};

/** Коинов за один профиль при «Обновить все» в радаре */
export const RADAR_REFRESH_TOKENS_PER_PROFILE = 5;

/**
 * Получить стоимость действия в коинах.
 * @param action — тип действия
 * @param profilesCount — для radar_refresh_all: количество профилей
 */
export function getTokenCost(
  action: TokenAction,
  profilesCount?: number
): number {
  if (action === 'radar_refresh_all') {
    const n = profilesCount ?? 0;
    return n * RADAR_REFRESH_TOKENS_PER_PROFILE;
  }
  return TOKEN_COSTS[action] ?? 0;
}
