import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm';
// Vite отдаёт .wasm как ассет и подставляет его URL (см. env.d.ts → vite/client).
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';

let cached: Promise<CanvasKit> | null = null;

/**
 * Загружает CanvasKit (Skia, скомпилированный в WASM) ровно один раз.
 *
 * По умолчанию используется npm-сборка `canvaskit-wasm` — её достаточно
 * для рендеринга на экран. В ней НЕТ PDF-бэкенда, поэтому экспорт идёт
 * через векторный fallback (pdf-lib).
 *
 * Если задана переменная окружения `VITE_CANVASKIT_PATH` (например,
 * `"/canvaskit/"`), загружается кастомная сборка из этой папки в `public/`.
 * Такая сборка может включать PDF-бэкенд Skia (см. scripts/build-canvaskit-pdf.sh),
 * и тогда экспорт пойдёт честным путём `SkPDF`.
 */
export function loadCanvasKit(): Promise<CanvasKit> {
  if (cached) return cached;

  const customBase = import.meta.env.VITE_CANVASKIT_PATH;
  cached = customBase ? loadCustomBuild(customBase) : CanvasKitInit({ locateFile: () => wasmUrl });
  return cached;
}

/** Загрузка кастомной сборки CanvasKit (UMD-glue + .wasm) из public/. */
async function loadCustomBuild(base: string): Promise<CanvasKit> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${base}canvaskit.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${script.src}`));
    document.head.appendChild(script);
  });

  const init = (window as unknown as { CanvasKitInit?: typeof CanvasKitInit }).CanvasKitInit;
  if (!init) throw new Error('Кастомная сборка не определила глобальный CanvasKitInit');
  return init({ locateFile: (file: string) => `${base}${file}` });
}

/** Доступен ли в загруженной сборке PDF-бэкенд Skia. */
export function isSkiaPdfAvailable(ck: CanvasKit): boolean {
  return typeof (ck as unknown as { MakePDFDocument?: unknown }).MakePDFDocument === 'function';
}
