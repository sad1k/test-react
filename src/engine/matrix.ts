import type { Matrix } from 'pixi.js-legacy';

/**
 * 2D-аффинная матрица в соглашении PixiJS / HTML Canvas:
 *
 *   x' = a·x + c·y + tx
 *   y' = b·x + d·y + ty
 *
 * Ровно те же шесть коэффициентов используют и Skia (`Canvas.concat`),
 * и PDF (оператор `cm`), поэтому матрица — это «общий язык» трансформаций
 * между всеми бэкендами рендеринга.
 */
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** Копирует `PIXI.Matrix` в простой {@link AffineMatrix}. */
export function toAffine(m: Matrix): AffineMatrix {
  return { a: m.a, b: m.b, c: m.c, d: m.d, tx: m.tx, ty: m.ty };
}

/**
 * Преобразует {@link AffineMatrix} в матрицу 3×3 (row-major, 9 чисел),
 * которую ожидает `CanvasKit.Canvas.concat`.
 */
export function toSkiaMatrix(m: AffineMatrix): number[] {
  // | a c tx |
  // | b d ty |
  // | 0 0 1  |
  return [m.a, m.c, m.tx, m.b, m.d, m.ty, 0, 0, 1];
}
