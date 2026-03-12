/**
 * Сервис для скачивания видео и транскрибации
 */

export interface TranscriptionResult {
  transcriptId: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  error?: string;
}

/**
 * Получает прямую ссылку на скачивание видео из Instagram.
 * Сразу через reel-info (оплаченный instagram-scraper-20251) — без fallback на download-video.
 */
export async function getVideoDownloadUrl(instagramUrl: string): Promise<string | null> {
  try {
    console.log('[Transcription] Getting download URL for:', instagramUrl);

    const reelRes = await fetch('/api/reel-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: instagramUrl, source: 'lenta' }),
    });
    const reelData = await reelRes.json();

    if (!reelRes.ok) {
      console.error('[Transcription] reel-info error:', reelRes.status);
      return null;
    }

    if (reelData.success && reelData.video_url?.trim()) {
      return reelData.video_url;
    }

    console.warn('[Transcription] reel-info did not return video_url');
    return null;
  } catch (error) {
    console.error('[Transcription] Error getting download URL:', error);
    return null;
  }
}

/**
 * Запускает транскрибацию видео
 */
export async function startTranscription(videoUrl: string): Promise<{ transcriptId: string } | null> {
  try {
    console.log('[Transcription] Starting transcription for:', videoUrl);
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audioUrl: videoUrl }),
    });

    if (!response.ok) {
      console.error('[Transcription] Transcribe API error:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('[Transcription] Transcription started:', data);
    
    return data.success ? { transcriptId: data.transcriptId } : null;
  } catch (error) {
    console.error('[Transcription] Error starting transcription:', error);
    return null;
  }
}

/**
 * Проверяет статус транскрибации
 */
export async function checkTranscriptionStatus(transcriptId: string): Promise<TranscriptionResult> {
  try {
    const response = await fetch(`/api/transcribe?transcriptId=${transcriptId}`, {
      method: 'GET',
    });

    if (!response.ok) {
      return { transcriptId, status: 'error', error: 'API error' };
    }

    const data = await response.json();
    
    return {
      transcriptId,
      status: data.status,
      text: data.text,
      error: data.error,
    };
  } catch (error) {
    console.error('[Transcription] Error checking status:', error);
    return { transcriptId, status: 'error', error: 'Network error' };
  }
}

/**
 * Ожидает завершения транскрибации (с polling)
 */
export async function waitForTranscription(transcriptId: string, maxWaitMs = 300000): Promise<TranscriptionResult> {
  const startTime = Date.now();
  const pollInterval = 3000; // 3 секунды между проверками
  
  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkTranscriptionStatus(transcriptId);
    
    if (result.status === 'completed' || result.status === 'error') {
      return result;
    }
    
    // Ждем перед следующей проверкой
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  return { transcriptId, status: 'error', error: 'Timeout waiting for transcription' };
}

/**
 * Нормализует Instagram URL для API (reels→reel, добавляет www)
 */
function normalizeInstagramUrl(url: string): string {
  const match = url.match(/\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  if (match) {
    const shortcode = match[1];
    const isPost = url.includes('/p/');
    return `https://www.instagram.com/${isPost ? 'p' : 'reel'}/${shortcode}/`;
  }
  return url;
}

/**
 * Полный процесс: скачивание + транскрибация
 */
export async function downloadAndTranscribe(instagramUrl: string): Promise<{
  success: boolean;
  videoUrl?: string;
  transcriptId?: string;
  error?: string;
}> {
  try {
    const normalizedUrl = normalizeInstagramUrl(instagramUrl);
    // 1. Получаем ссылку на скачивание
    const videoUrl = await getVideoDownloadUrl(normalizedUrl);
    
    if (!videoUrl) {
      return { success: false, error: 'Failed to get video download URL' };
    }
    
    // 2. Запускаем транскрибацию
    const transcriptionResult = await startTranscription(videoUrl);
    
    if (!transcriptionResult) {
      return { success: false, videoUrl, error: 'Failed to start transcription' };
    }
    
    return {
      success: true,
      videoUrl,
      transcriptId: transcriptionResult.transcriptId,
    };
  } catch (error) {
    console.error('[Transcription] Full process error:', error);
    return { success: false, error: 'Unexpected error' };
  }
}
