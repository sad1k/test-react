import type { Container } from 'pixi.js-legacy';
import type { CanvasKit, Image, Surface } from 'canvaskit-wasm';

import { drawNode } from '../engine/walker';
import { SkiaTarget } from './SkiaTarget';

/**
 * «Сцена Skia»: владеет поверхностью CanvasKit на отдельном `<canvas>`
 * и перерисовывает в неё переданный `PIXI.Container`.
 *
 * На каждый кадр (по тикеру PixiJS) вызывается {@link render}, которая
 * заново обходит дерево сцены и рисует его средствами Skia — так второй
 * холст «зеркалит» то, что PixiJS показывает на первом.
 */
export class SkiaStage {
  private readonly surface: Surface;
  /** Кэш декодированных изображений между кадрами. */
  private readonly images = new Map<string, Image>();
  private readonly dpr: number;

  constructor(
    private readonly ck: CanvasKit,
    canvasEl: HTMLCanvasElement,
    public readonly width: number,
    public readonly height: number,
    dpr = 1,
  ) {
    this.dpr = dpr;
    // Backing store с учётом плотности пикселей; CSS растянет по контейнеру.
    canvasEl.width = Math.floor(width * dpr);
    canvasEl.height = Math.floor(height * dpr);

    // Используем программную (CPU) поверхность: она максимально совместима —
    // работает без GPU и в headless-окружениях, не занимает WebGL-контекст и
    // не конфликтует с композитором браузера. Для наших небольших сцен с
    // рендером по требованию её производительности более чем достаточно.
    // (WebGL — как запасной вариант, если 2D-поверхность вдруг недоступна.)
    const surface = this.ck.MakeSWCanvasSurface(canvasEl) ?? this.ck.MakeWebGLCanvasSurface(canvasEl);
    if (!surface) throw new Error('Не удалось создать поверхность Skia на canvas');
    this.surface = surface;
  }

  /** Перерисовывает контейнер в Skia-холст. */
  render(root: Container): void {
    const canvas = this.surface.getCanvas();
    canvas.clear(this.ck.WHITE);
    canvas.save();
    canvas.scale(this.dpr, this.dpr); // рисуем в логических координатах сцены
    drawNode(new SkiaTarget(this.ck, canvas, this.images), root, 1);
    canvas.restore();
    this.surface.flush();
  }

  /** Кэш изображений (переиспользуется PDF-экспортом через Skia). */
  get imageCache(): Map<string, Image> {
    return this.images;
  }

  /** Освобождает WASM-ресурсы. */
  dispose(): void {
    for (const image of this.images.values()) image.delete();
    this.images.clear();
    this.surface.delete();
  }
}
