/**
 * Конвертирует любой `CanvasImageSource` (HTMLImageElement / Canvas /
 * ImageBitmap) в байты PNG. Нужно для встраивания спрайта в PDF через
 * `PDFDocument.embedPng` в fallback-экспортере на pdf-lib.
 */
export async function sourceToPngBytes(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D-контекст недоступен для конвертации спрайта в PNG');
  ctx.drawImage(source, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Не удалось сериализовать спрайт в PNG');
  return new Uint8Array(await blob.arrayBuffer());
}
