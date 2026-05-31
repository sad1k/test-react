import type { AffineMatrix } from './matrix';
import type { Rgb } from './color';

// Ре-экспорт, чтобы цели рисования могли импортировать тип из одного места.
export type { AffineMatrix };

/**
 * Команда контура. Набор намеренно минимален и совпадает с примитивами,
 * которые есть и у Skia (`Path.moveTo/lineTo/quadTo/cubicTo/close`),
 * и у PDF (`m / l / v-c / c / h`). Благодаря этому ОДИН и тот же контур
 * один-в-один воспроизводится на любом бэкенде.
 */
export type PathCmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; cx: number; cy: number; x: number; y: number } // квадратичная кривая
  | { t: 'C'; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number } // кубическая
  | { t: 'Z' }; // закрыть подконтур

/** Контур — последовательность команд (может содержать несколько подконтуров). */
export type Path = PathCmd[];

/** Параметры заливки. */
export interface FillPaint {
  rgb: Rgb;
  alpha: number;
}

/** Стиль линии (соответствует `PIXI.LineStyle`). */
export interface StrokePaint {
  rgb: Rgb;
  alpha: number;
  width: number;
  cap: CapType;
  join: JoinType;
  miterLimit: number;
}

export type CapType = 'butt' | 'round' | 'square';
export type JoinType = 'miter' | 'round' | 'bevel';

/** Прямоугольник (используется для src/dest при отрисовке изображений). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Ссылка на растровое изображение (источник спрайта). */
export interface ImageRef {
  /** Уникальный ключ (uid baseTexture) — для кэширования. */
  key: string;
  /** Источник, пригодный для отрисовки (HTMLImageElement / Canvas / ImageBitmap). */
  source: CanvasImageSource;
  /** Натуральные размеры источника в пикселях. */
  width: number;
  height: number;
}

/**
 * Бэкенд-независимая «цель рисования».
 *
 * Это ключевая абстракция всего проекта: обходчик сцены (`walker.ts`)
 * читает `PIXI.Container` и транслирует его в вызовы этого интерфейса,
 * ничего не зная о конкретном движке. Реализации:
 *  - {@link SkiaTarget}   — рисует на `CanvasKit.Canvas` (экран и Skia-PDF);
 *  - {@link PdfLibTarget} — пишет векторные операторы в PDF через pdf-lib.
 */
export interface VectorTarget {
  /** Сохранить текущую матрицу/состояние (как `ctx.save()`). */
  save(): void;
  /** Восстановить состояние (как `ctx.restore()`). */
  restore(): void;
  /** Домножить текущую матрицу на `m` (как `ctx.transform(...)`). */
  transform(m: AffineMatrix): void;
  /** Залить контур. */
  fillPath(path: Path, paint: FillPaint): void;
  /** Обвести контур. */
  strokePath(path: Path, paint: StrokePaint): void;
  /** Нарисовать прямоугольный фрагмент `src` изображения в прямоугольник `dest`. */
  drawImage(image: ImageRef, src: Rect, dest: Rect, alpha: number): void;
}
