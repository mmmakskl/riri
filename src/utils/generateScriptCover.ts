/**
 * Генерирует обложку для сценария в iOS-стиле:
 * молочный/кремовый градиентный фон + заголовок слева сверху.
 * Возвращает Blob (PNG).
 */
export async function generateScriptCover(title: string): Promise<Blob> {
  const W = 540;
  const H = 720;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#faf8f5');
  bg.addColorStop(0.4, '#f5f0eb');
  bg.addColorStop(0.7, '#efe9e1');
  bg.addColorStop(1, '#e8e0d6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // subtle warm circle
  ctx.save();
  const grad = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.5);
  grad.addColorStop(0, 'rgba(255, 237, 213, 0.4)');
  grad.addColorStop(1, 'rgba(255, 237, 213, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // icon
  ctx.save();
  ctx.font = '28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(180, 160, 140, 0.6)';
  ctx.fillText('📝', 36, 56);
  ctx.restore();

  // title
  ctx.save();
  const maxWidth = W - 80;
  ctx.font = '600 22px system-ui, -apple-system, "SF Pro Display", sans-serif';
  ctx.fillStyle = '#44403c';
  ctx.textBaseline = 'top';

  const displayTitle = title.length > 80 ? title.slice(0, 77) + '...' : title;
  const words = displayTitle.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = 30;
  const startY = 84;
  for (let i = 0; i < Math.min(lines.length, 4); i++) {
    ctx.fillText(lines[i], 40, startY + i * lineHeight);
  }
  ctx.restore();

  // bottom label
  ctx.save();
  ctx.font = '500 13px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(120, 113, 108, 0.5)';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Сценарий', 40, H - 36);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob || new Blob());
    }, 'image/png');
  });
}

/**
 * Загружает обложку в Supabase Storage через API save-media
 * и возвращает публичный URL.
 */
export async function uploadScriptCover(title: string, draftId: string): Promise<string | null> {
  try {
    const blob = await generateScriptCover(title);
    const formData = new FormData();
    formData.append('file', blob, `script-cover-${draftId}.png`);

    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });

    const res = await fetch('/api/save-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'thumbnail',
        url: base64,
        shortcode: `script-${draftId}`,
      }),
    });

    const data = await res.json();
    if (data.success && data.storageUrl) {
      return data.storageUrl;
    }

    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('[generateScriptCover] error:', err);
    return null;
  }
}
