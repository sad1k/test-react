import type { Container, DisplayObject } from 'pixi.js-legacy';
import { hitTest } from './hitTest';

export type PointerKind = 'pointerdown' | 'pointerup';

export interface SkiaHit {
  kind: PointerKind;
  target: DisplayObject;
  x: number;
  y: number;
}

/**
 * Навешивает обработку pointer-событий на Skia-холст.
 *
 * Координаты курсора переводятся из CSS-пикселей холста в логические
 * координаты сцены, после чего выполняется {@link hitTest}. Если объект
 * найден — вызывается `onHit`, а вызывающая сторона (PixiSkiaApp) ретранслирует
 * событие в систему PixiJS (`target.emit(kind)`), так что одни и те же
 * обработчики `.on('pointerdown' | 'pointerup')` срабатывают на ОБОИХ холстах.
 *
 * @returns функция отписки.
 */
export function attachSkiaPointer(
  canvasEl: HTMLCanvasElement,
  getRoot: () => Container,
  logical: { width: number; height: number },
  onHit: (hit: SkiaHit) => void,
): () => void {
  const toScene = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * logical.width,
      y: ((e.clientY - rect.top) / rect.height) * logical.height,
    };
  };

  const make =
    (kind: PointerKind) =>
    (e: PointerEvent): void => {
      const point = toScene(e);
      const target = hitTest(getRoot(), point);
      if (target) onHit({ kind, target, x: point.x, y: point.y });
    };

  const onDown = make('pointerdown');
  const onUp = make('pointerup');
  canvasEl.addEventListener('pointerdown', onDown);
  canvasEl.addEventListener('pointerup', onUp);

  return () => {
    canvasEl.removeEventListener('pointerdown', onDown);
    canvasEl.removeEventListener('pointerup', onUp);
  };
}
