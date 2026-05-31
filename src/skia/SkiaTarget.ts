import type { Canvas, CanvasKit, Image, Paint, Path as SkPath } from 'canvaskit-wasm';

import { clamp01 } from '../engine/color';
import { toSkiaMatrix } from '../engine/matrix';
import type {
  AffineMatrix,
  CapType,
  FillPaint,
  ImageRef,
  JoinType,
  Path,
  Rect,
  StrokePaint,
  VectorTarget,
} from '../engine/target';

/**
 * Реализация {@link VectorTarget} поверх `CanvasKit.Canvas`.
 *
 * Один и тот же `SkiaTarget` используется и для рендера на экран
 * (canvas, полученный из `Surface.getCanvas()`), и для экспорта в PDF
 * (canvas страницы `SkPDF`-документа — если доступна кастомная сборка).
 *
 * Объекты CanvasKit (`Paint`, `Path`) живут в WASM-куче, поэтому каждый
 * временный объект освобождается через `delete()` сразу после использования.
 */
export class SkiaTarget implements VectorTarget {
  constructor(
    private readonly ck: CanvasKit,
    private readonly canvas: Canvas,
    /** Кэш декодированных изображений (общий между кадрами), ключ — uid baseTexture. */
    private readonly images: Map<string, Image>,
  ) {}

  save(): void {
    this.canvas.save();
  }

  restore(): void {
    this.canvas.restore();
  }

  transform(m: AffineMatrix): void {
    this.canvas.concat(toSkiaMatrix(m));
  }

  fillPath(path: Path, paint: FillPaint): void {
    const skPath = this.buildPath(path);
    const skPaint = this.createFillPaint(paint);
    this.canvas.drawPath(skPath, skPaint);
    skPath.delete();
    skPaint.delete();
  }

  strokePath(path: Path, paint: StrokePaint): void {
    const skPath = this.buildPath(path);
    const skPaint = this.createStrokePaint(paint);
    this.canvas.drawPath(skPath, skPaint);
    skPath.delete();
    skPaint.delete();
  }

  drawImage(image: ImageRef, src: Rect, dest: Rect, alpha: number): void {
    const skImage = this.getImage(image);
    if (!skImage) return;

    const paint = new this.ck.Paint();
    paint.setAntiAlias(true);
    paint.setAlphaf(clamp01(alpha));
    this.canvas.drawImageRect(
      skImage,
      this.ck.LTRBRect(src.x, src.y, src.x + src.w, src.y + src.h),
      this.ck.LTRBRect(dest.x, dest.y, dest.x + dest.w, dest.y + dest.h),
      paint,
      false,
    );
    paint.delete();
  }

  /** Собирает `CanvasKit.Path` из бэкенд-независимого контура. */
  private buildPath(path: Path): SkPath {
    const p = new this.ck.Path();
    for (const cmd of path) {
      switch (cmd.t) {
        case 'M':
          p.moveTo(cmd.x, cmd.y);
          break;
        case 'L':
          p.lineTo(cmd.x, cmd.y);
          break;
        case 'Q':
          p.quadTo(cmd.cx, cmd.cy, cmd.x, cmd.y);
          break;
        case 'C':
          p.cubicTo(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y);
          break;
        case 'Z':
          p.close();
          break;
      }
    }
    return p;
  }

  private createFillPaint(paint: FillPaint): Paint {
    const p = new this.ck.Paint();
    p.setAntiAlias(true);
    p.setStyle(this.ck.PaintStyle.Fill);
    p.setColor(this.ck.Color4f(paint.rgb.r, paint.rgb.g, paint.rgb.b, clamp01(paint.alpha)));
    return p;
  }

  private createStrokePaint(paint: StrokePaint): Paint {
    const p = new this.ck.Paint();
    p.setAntiAlias(true);
    p.setStyle(this.ck.PaintStyle.Stroke);
    p.setStrokeWidth(paint.width);
    p.setStrokeCap(this.mapCap(paint.cap));
    p.setStrokeJoin(this.mapJoin(paint.join));
    p.setStrokeMiter(paint.miterLimit);
    p.setColor(this.ck.Color4f(paint.rgb.r, paint.rgb.g, paint.rgb.b, clamp01(paint.alpha)));
    return p;
  }

  private mapCap(cap: CapType) {
    const C = this.ck.StrokeCap;
    return cap === 'round' ? C.Round : cap === 'square' ? C.Square : C.Butt;
  }

  private mapJoin(join: JoinType) {
    const J = this.ck.StrokeJoin;
    return join === 'round' ? J.Round : join === 'bevel' ? J.Bevel : J.Miter;
  }

  /** Декодирует (с кэшированием) изображение спрайта в `CanvasKit.Image`. */
  private getImage(image: ImageRef): Image | null {
    let skImage = this.images.get(image.key);
    if (!skImage) {
      try {
        skImage = this.ck.MakeImageFromCanvasImageSource(image.source);
        this.images.set(image.key, skImage);
      } catch {
        return null;
      }
    }
    return skImage;
  }
}
