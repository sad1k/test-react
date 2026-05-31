import {
  appendBezierCurve,
  closePath,
  concatTransformationMatrix,
  drawObject,
  fill,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  type PDFName,
  type PDFOperator,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
} from 'pdf-lib';

import { blendOverWhite } from '../engine/color';
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
 * Реализация {@link VectorTarget} поверх страницы pdf-lib.
 *
 * Пишет «сырые» операторы потока содержимого PDF (cm, m/l/c/v, f/S, …),
 * поэтому результат — НАСТОЯЩАЯ векторная графика (а не картинка):
 * фигуры и линии остаются кривыми Безье и отрезками, масштабируются без
 * потери качества. Спрайты встраиваются как растровые XObject (bitmap) —
 * ровно как требует ТЗ (исключение для `PIXI.Sprite`).
 *
 * Используется как fallback, когда в загруженной сборке CanvasKit нет
 * PDF-бэкенда Skia. Прозрачность аппроксимируется смешением с белым фоном
 * (см. {@link blendOverWhite}).
 */
export class PdfLibTarget implements VectorTarget {
  private readonly ops: PDFOperator[] = [];

  constructor(
    private readonly page: PDFPage,
    /** Имена встроенных XObject-изображений по ключу спрайта. */
    private readonly imageNames: Map<string, PDFName>,
  ) {}

  save(): void {
    this.ops.push(pushGraphicsState());
  }

  restore(): void {
    this.ops.push(popGraphicsState());
  }

  transform(m: AffineMatrix): void {
    // Оператор cm: [a b c d e f]. Соглашение совпадает с PixiJS (a,b,c,d,tx,ty).
    this.ops.push(concatTransformationMatrix(m.a, m.b, m.c, m.d, m.tx, m.ty));
  }

  fillPath(path: Path, paint: FillPaint): void {
    const c = blendOverWhite(paint.rgb, paint.alpha);
    this.ops.push(setFillingRgbColor(c.r, c.g, c.b));
    this.emitPath(path);
    this.ops.push(fill());
  }

  strokePath(path: Path, paint: StrokePaint): void {
    const c = blendOverWhite(paint.rgb, paint.alpha);
    this.ops.push(
      setStrokingRgbColor(c.r, c.g, c.b),
      setLineWidth(paint.width),
      setLineCap(mapCap(paint.cap)),
      setLineJoin(mapJoin(paint.join)),
    );
    this.emitPath(path);
    this.ops.push(stroke());
  }

  drawImage(image: ImageRef, _src: Rect, dest: Rect, _alpha: number): void {
    const name = this.imageNames.get(image.key);
    if (!name) return;
    // Изображение рисуется в единичный квадрат и трансформируется в dest.
    // Матрица [w 0 0 -h x y+h] переворачивает картинку под нашу систему
    // координат (верх-лево, y вниз), так как XObject-изображение в PDF
    // отсчитывается снизу-вверх.
    this.ops.push(
      pushGraphicsState(),
      concatTransformationMatrix(dest.w, 0, 0, -dest.h, dest.x, dest.y + dest.h),
      drawObject(name),
      popGraphicsState(),
    );
  }

  /** Транслирует бэкенд-независимый контур в операторы пути PDF. */
  private emitPath(path: Path): void {
    for (const cmd of path) {
      switch (cmd.t) {
        case 'M':
          this.ops.push(moveTo(cmd.x, cmd.y));
          break;
        case 'L':
          this.ops.push(lineTo(cmd.x, cmd.y));
          break;
        case 'Q':
          // PDF не имеет квадратичных кривых — повышаем степень до кубической.
          // Контрольные точки кубики: P0 + 2/3·(C−P0) и P3 + 2/3·(C−P3).
          this.ops.push(quadraticToCubic(cmd.cx, cmd.cy, cmd.x, cmd.y, this.lastPoint));
          this.lastPoint = { x: cmd.x, y: cmd.y };
          continue;
        case 'C':
          this.ops.push(appendBezierCurve(cmd.c1x, cmd.c1y, cmd.c2x, cmd.c2y, cmd.x, cmd.y));
          break;
        case 'Z':
          this.ops.push(closePath());
          break;
      }
      if (cmd.t === 'M' || cmd.t === 'L' || cmd.t === 'C') {
        this.lastPoint = { x: cmd.x, y: cmd.y };
      }
    }
  }

  /** Текущая позиция пера — нужна для конвертации квадратичных кривых. */
  private lastPoint: { x: number; y: number } = { x: 0, y: 0 };

  /** Дописывает накопленные операторы в поток содержимого страницы. */
  flush(): void {
    if (this.ops.length) {
      this.page.pushOperators(...this.ops);
      this.ops.length = 0;
    }
  }
}

function mapCap(cap: CapType): LineCapStyle {
  return cap === 'round'
    ? LineCapStyle.Round
    : cap === 'square'
      ? LineCapStyle.Projecting
      : LineCapStyle.Butt;
}

function mapJoin(join: JoinType): LineJoinStyle {
  return join === 'round'
    ? LineJoinStyle.Round
    : join === 'bevel'
      ? LineJoinStyle.Bevel
      : LineJoinStyle.Miter;
}

/**
 * Конвертирует квадратичную кривую (control C, end P) в кубическую,
 * начиная из точки `from`. Формула повышения степени Безье.
 */
function quadraticToCubic(
  cx: number,
  cy: number,
  x: number,
  y: number,
  from: { x: number; y: number },
): PDFOperator {
  const c1x = from.x + (2 / 3) * (cx - from.x);
  const c1y = from.y + (2 / 3) * (cy - from.y);
  const c2x = x + (2 / 3) * (cx - x);
  const c2y = y + (2 / 3) * (cy - y);
  return appendBezierCurve(c1x, c1y, c2x, c2y, x, y);
}
