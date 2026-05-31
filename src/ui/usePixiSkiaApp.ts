import { useCallback, useEffect, useRef, useState } from 'react';

import { PixiSkiaApp, type AppStatus, type LogEntry } from '../app/PixiSkiaApp';
import { CONFIG } from '../config';

/**
 * React-хук: создаёт {@link PixiSkiaApp} на двух canvas-элементах, отдаёт
 * состояние (статус, журнал событий, имя сцены) и действия для тулбара.
 *
 * Вся «тяжёлая» логика живёт в фреймворк-независимом движке — хук лишь
 * мост между ним и React-состоянием.
 */
export function usePixiSkiaApp() {
  const pixiCanvasRef = useRef<HTMLCanvasElement>(null);
  const skiaCanvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<PixiSkiaApp | null>(null);

  const [status, setStatus] = useState<AppStatus>({ state: 'loading', message: 'Инициализация…' });
  const [events, setEvents] = useState<LogEntry[]>([]);
  const [sceneName, setSceneName] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const pixiCanvas = pixiCanvasRef.current;
    const skiaCanvas = skiaCanvasRef.current;
    if (!pixiCanvas || !skiaCanvas) return;

    const app = new PixiSkiaApp({
      onLog: (entry) => setEvents((prev) => [entry, ...prev].slice(0, 100)),
      onStatus: setStatus,
      onScene: setSceneName,
    });
    appRef.current = app;

    app.init(pixiCanvas, skiaCanvas).catch((err: unknown) =>
      setStatus({
        state: 'error',
        message: `Ошибка инициализации: ${(err as Error)?.message ?? String(err)}`,
      }),
    );

    return () => {
      app.dispose();
      appRef.current = null;
    };
  }, []);

  const addRandomShape = useCallback(() => appRef.current?.addRandomShape(), []);
  const nextScene = useCallback(() => appRef.current?.nextScene(), []);
  const toggleAutoplay = useCallback((on: boolean) => appRef.current?.setAutoplay(on), []);
  const clearEvents = useCallback(() => setEvents([]), []);

  const exportPdf = useCallback(async () => {
    const app = appRef.current;
    if (!app) return;
    setExporting(true);
    try {
      const { bytes, method } = await app.exportPdf();
      downloadPdf(bytes, CONFIG.pdfFileName);
      setStatus({ state: 'ready', message: `PDF сохранён · ${method}` });
    } catch (err) {
      setStatus({
        state: 'error',
        message: `Экспорт не удался: ${(err as Error)?.message ?? String(err)}`,
      });
    } finally {
      setExporting(false);
    }
  }, []);

  return {
    pixiCanvasRef,
    skiaCanvasRef,
    status,
    events,
    sceneName,
    exporting,
    addRandomShape,
    nextScene,
    toggleAutoplay,
    clearEvents,
    exportPdf,
  };
}

/** Скачивает байты как PDF-файл. */
function downloadPdf(bytes: Uint8Array, fileName: string): void {
  // new Uint8Array(bytes) даёт буфер на базе ArrayBuffer (а не SharedArrayBuffer),
  // что требуется типом BlobPart в свежих lib.dom.
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
