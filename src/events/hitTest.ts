import { Container, Point } from 'pixi.js-legacy';
import type { DisplayObject } from 'pixi.js-legacy';

/**
 * Рекурсивный hit-test по дереву сцены — повторяет логику системы событий
 * PixiJS, но применим к ЛЮБОМУ холсту (в т.ч. к Skia-холсту, который PixiJS
 * не рендерит и о событиях которого ничего не знает).
 *
 * Объект считается попавшим под указатель, если:
 *  - он видим и его `eventMode` допускает события (`static` / `dynamic`);
 *  - точка проходит `containsPoint`.
 *
 * Важно: `Graphics.containsPoint` и `Sprite.containsPoint` в PixiJS принимают
 * ГЛОБАЛЬНУЮ точку и сами применяют `worldTransform.applyInverse` (см. исходники
 * @pixi/graphics, @pixi/sprite) — ровно так их вызывает и встроенная система
 * событий PixiJS (EventBoundary). Поэтому мы передаём мировую точку как есть,
 * и hit-test на Skia-холсте даёт тот же результат, что и на холсте PixiJS,
 * с учётом поворотов и масштаба.
 *
 * @param global Точка в координатах сцены (= мировых, логических пикселях).
 */
export function hitTest(node: DisplayObject, global: { x: number; y: number }): DisplayObject | null {
  if (!node.visible || node.eventMode === 'none') return null;

  // Сначала проверяем детей сверху вниз (последний нарисованный — самый верхний).
  if (node instanceof Container && node.interactiveChildren !== false) {
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const hit = hitTest(children[i], global);
      if (hit) return hit;
    }
  }

  const interactive = node.eventMode === 'static' || node.eventMode === 'dynamic';
  const candidate = node as DisplayObject & { containsPoint?: (p: Point) => boolean };
  if (interactive && typeof candidate.containsPoint === 'function') {
    if (candidate.containsPoint(new Point(global.x, global.y))) return node;
  }

  return null;
}
