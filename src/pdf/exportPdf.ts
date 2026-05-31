import { PDFDocument, type PDFName, concatTransformationMatrix } from 'pdf-lib';
import type { Canvas, CanvasKit, Image } from 'canvaskit-wasm';
import type { Container } from 'pixi.js-legacy';

import { collectSpriteImages, drawNode } from '../engine/walker';
import { isSkiaPdfAvailable } from '../skia/canvaskit';
import { SkiaTarget } from '../skia/SkiaTarget';
import { PdfLibTarget } from './PdfLibTarget';
import { sourceToPngBytes } from './pngBytes';

export interface PdfExportResult {
  bytes: Uint8Array;
  /** Человекочитаемое описание пути экспорта. */
  method: string;
}

/**
 * Экспортирует сцену в PDF.
 *
 * Приоритетный путь — PDF-бэкенд Skia (`SkPDF`): тот же {@link SkiaTarget},
 * что рисует на экран, рисует на canvas страницы PDF — получается векторный
 * вывод «бесплатно». Этот путь требует кастомной WASM-сборки CanvasKit
 * с PDF (см. scripts/build-canvaskit-pdf.sh).
 *
 * Если PDF-бэкенда в сборке нет (npm-сборка canvaskit-wasm), используется
 * векторный fallback на pdf-lib — он тоже даёт настоящую векторную графику.
 */
export async function exportScenePdf(
  ck: CanvasKit,
  root: Container,
  width: number,
  height: number,
  skiaImages: Map<string, Image>,
): Promise<PdfExportResult> {
  if (isSkiaPdfAvailable(ck)) {
    return {
      bytes: exportViaSkiaPdf(ck, root, width, height, skiaImages),
      method: 'Skia PDF backend (SkPDF, кастомная WASM-сборка)',
    };
  }
  return {
    bytes: await exportViaPdfLib(root, width, height),
    method: 'pdf-lib (векторный fallback)',
  };
}

/**
 * Экспорт через PDF-бэкенд Skia. Использует тот же обходчик сцены и тот же
 * {@link SkiaTarget}, что и экранный рендер, но canvas берётся из страницы
 * PDF-документа. API соответствует биндингам из scripts/build-canvaskit-pdf.sh.
 */
function exportViaSkiaPdf(
  ck: CanvasKit,
  root: Container,
  width: number,
  height: number,
  skiaImages: Map<string, Image>,
): Uint8Array {
  // Биндинги PDF добавляются кастомной сборкой и не описаны в типах npm-пакета.
  const pdf = ck as unknown as {
    MakePDFDocument: () => {
      beginPage: (w: number, h: number) => Canvas;
      endPage: () => void;
      close: () => Uint8Array;
    };
  };

  const doc = pdf.MakePDFDocument();
  const canvas = doc.beginPage(width, height);
  canvas.clear(ck.WHITE);
  drawNode(new SkiaTarget(ck, canvas, skiaImages), root, 1);
  doc.endPage();
  return doc.close();
}

/** Векторный экспорт через pdf-lib (работает с обычной npm-сборкой CanvasKit). */
async function exportViaPdfLib(root: Container, width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([width, height]);

  // Встраиваем PNG всех спрайтов и регистрируем их как XObject страницы.
  const sprites = collectSpriteImages(root);
  const imageNames = new Map<string, PDFName>();
  for (const ref of sprites.values()) {
    const bytes = await sourceToPngBytes(ref.source, ref.width, ref.height);
    const image = await doc.embedPng(bytes);
    imageNames.set(ref.key, page.node.newXObject('Sprite', image.ref));
  }

  // Базовый переворот координат: PDF — y вверх снизу, у нас — y вниз сверху.
  page.pushOperators(concatTransformationMatrix(1, 0, 0, -1, 0, height));

  const target = new PdfLibTarget(page, imageNames);
  drawNode(target, root, 1);
  target.flush();

  return doc.save();
}
