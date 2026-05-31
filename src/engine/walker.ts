import { Container, Graphics, Sprite, SHAPES } from 'pixi.js-legacy';
import type { DisplayObject, GraphicsData } from 'pixi.js-legacy';

import { toAffine } from './matrix';
import { intToRgb, multiplyRgb } from './color';
import type { CapType, JoinType, ImageRef, Path, Rect, VectorTarget } from './target';
import { circlePath, ellipsePath, polyPath, rectPath, roundedRectPath } from './geometry';

/**
 * Обходит дерево `PIXI.DisplayObject` и транслирует его в вызовы
 * {@link VectorTarget}. Это и есть «обёртка над Skia», но написанная
 * абстрактно: она одинаково работает и для экранного рендера через Skia,
 * и для векторного экспорта в PDF.
 *
 * Логика отрисовки фигур и спрайтов портирована из канвас-рендерера PixiJS
 * (`CanvasGraphicsRenderer`, `CanvasSpriteRenderer`), поэтому результат
 * совпадает с эталонным выводом PixiJS.
 *
 * Трансформации (translate / rotate / scale / pivot / skew) применяются
 * через `save → transform(localMatrix) → … → restore`: композиция локальных
 * матриц вдоль дерева в точности даёт мировую матрицу каждого объекта.
 *
 * @param target      Цель рисования (Skia или PDF).
 * @param node        Узел сцены.
 * @param parentAlpha Накопленная прозрачность родителей.
 */
export function drawNode(target: VectorTarget, node: DisplayObject, parentAlpha = 1): void {
  if (!node.visible) return;

  // Гарантируем актуальность локальной матрицы (PixiJS пересчитывает её лениво).
  node.transform.updateLocalTransform();

  target.save();
  target.transform(toAffine(node.transform.localTransform));

  const worldAlpha = parentAlpha * node.alpha;

  if (node.renderable && worldAlpha > 0) {
    if (node instanceof Graphics) {
      drawGraphics(target, node, worldAlpha);
    } else if (node instanceof Sprite) {
      drawSprite(target, node, worldAlpha);
    }
  }

  // Дочерние элементы рисуются поверх собственного содержимого узла.
  if (node instanceof Container) {
    const children = node.children;
    for (let i = 0; i < children.length; i++) {
      drawNode(target, children[i], worldAlpha);
    }
  }

  target.restore();
}

/** Отрисовка `PIXI.Graphics`: обходим все `graphicsData` и рисуем заливку/обводку. */
function drawGraphics(target: VectorTarget, g: Graphics, worldAlpha: number): void {
  const list = g.geometry.graphicsData;
  const tint = intToRgb((g.tint ?? 0xffffff) as number);

  for (let i = 0; i < list.length; i++) {
    const data = list[i];
    const fillStyle = data.fillStyle;
    const lineStyle = data.lineStyle;

    // Локальная матрица фигуры (например, заданная через `Graphics.setMatrix`).
    const hasMatrix = !!data.matrix;
    if (hasMatrix) {
      target.save();
      target.transform(toAffine(data.matrix!));
    }

    const fillRgb = multiplyRgb(intToRgb((fillStyle.color | 0) >>> 0), tint);
    const lineRgb = multiplyRgb(intToRgb((lineStyle.color | 0) >>> 0), tint);

    // Смещение контура для невыровненной по центру обводки (alignment ≠ 0.5).
    const alignOffset = lineStyle.visible ? lineStyle.width * (lineStyle.alignment - 0.5) : 0;
    const fillPath = buildShapePath(data, 0);
    const strokePath = alignOffset !== 0 ? buildShapePath(data, alignOffset) : fillPath;

    const doFill = (): void => {
      if (fillStyle.visible && fillPath.length) {
        target.fillPath(fillPath, { rgb: fillRgb, alpha: fillStyle.alpha * worldAlpha });
      }
    };
    const doStroke = (): void => {
      if (lineStyle.visible && strokePath.length && lineStyle.width > 0) {
        target.strokePath(strokePath, {
          rgb: lineRgb,
          alpha: lineStyle.alpha * worldAlpha,
          width: lineStyle.width,
          cap: lineStyle.cap as CapType,
          join: lineStyle.join as JoinType,
          miterLimit: lineStyle.miterLimit,
        });
      }
    };

    // При alignment === 1 (внешняя обводка) PixiJS рисует заливку ПОВЕРХ обводки.
    if (lineStyle.alignment === 1) {
      doStroke();
      doFill();
    } else {
      doFill();
      doStroke();
    }

    if (hasMatrix) target.restore();
  }
}

/** Преобразует `GraphicsData` PixiJS в наш бэкенд-независимый {@link Path}. */
function buildShapePath(data: GraphicsData, expand: number): Path {
  const shape = data.shape as unknown as {
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    points?: number[];
    closeStroke?: boolean;
  };
  switch (data.type) {
    case SHAPES.RECT:
      return rectPath(shape.x, shape.y, shape.width, shape.height, expand);
    case SHAPES.CIRC:
      return circlePath(shape.x, shape.y, shape.radius, expand);
    case SHAPES.ELIP:
      return ellipsePath(shape.x, shape.y, shape.width, shape.height, expand);
    case SHAPES.RREC:
      return roundedRectPath(shape.x, shape.y, shape.width, shape.height, shape.radius, expand);
    case SHAPES.POLY: {
      const path = polyPath(shape.points ?? [], !!shape.closeStroke);
      // Отверстия (beginHole/endHole) добавляем как отдельные подконтуры.
      const holes = data.holes;
      if (holes && holes.length) {
        for (const hole of holes) {
          const hp = hole.shape as { points?: number[]; closeStroke?: boolean };
          path.push(...polyPath(hp.points ?? [], !!hp.closeStroke));
        }
      }
      return path;
    }
    default:
      return [];
  }
}

/**
 * Отрисовка `PIXI.Sprite`. Формула позиционирования (anchor, trim, frame)
 * взята из `CanvasSpriteRenderer`. Поворот атласа (`texture.rotate`)
 * и тинт здесь не учитываются — для обычных PNG-спрайтов они не нужны.
 */
function drawSprite(target: VectorTarget, sprite: Sprite, worldAlpha: number): void {
  const tex = sprite.texture;
  if (!tex || !tex.valid) return;

  const baseTexture = tex.baseTexture;
  const source: CanvasImageSource | undefined =
    (baseTexture as unknown as { getDrawableSource?: () => CanvasImageSource }).getDrawableSource?.() ??
    ((baseTexture.resource as unknown as { source?: CanvasImageSource })?.source);
  if (!source) return;

  const orig = tex.orig;
  const frame = tex.frame;
  const trim = tex.trim;
  const res = baseTexture.resolution || 1;

  let dx: number;
  let dy: number;
  let destW: number;
  let destH: number;

  if (trim) {
    dx = trim.width / 2 + trim.x - sprite.anchor.x * orig.width;
    dy = trim.height / 2 + trim.y - sprite.anchor.y * orig.height;
    destW = trim.width;
    destH = trim.height;
  } else {
    dx = (0.5 - sprite.anchor.x) * orig.width;
    dy = (0.5 - sprite.anchor.y) * orig.height;
    destW = frame.width;
    destH = frame.height;
  }
  dx -= destW / 2;
  dy -= destH / 2;

  const src: Rect = {
    x: frame.x * res,
    y: frame.y * res,
    w: frame.width * res,
    h: frame.height * res,
  };
  const dest: Rect = { x: dx, y: dy, w: destW, h: destH };

  const img: ImageRef = {
    key: String(baseTexture.uid),
    source,
    width: (source as { width?: number }).width ?? destW,
    height: (source as { height?: number }).height ?? destH,
  };

  target.drawImage(img, src, dest, worldAlpha);
}

/**
 * Удобная «обёртка над Skia» с сигнатурой из техзадания.
 * Принимает любую цель рисования и контейнер PixiJS.
 *
 * @example
 *   convertPixiContainerToSkia(skiaTarget, mainContainer)
 */
export function convertPixiContainerToSkia(target: VectorTarget, container: Container): void {
  drawNode(target, container, 1);
}

/** Собирает уникальные текстуры всех спрайтов в дереве (для предзагрузки в PDF). */
export function collectSpriteImages(node: DisplayObject, out = new Map<string, ImageRef>()): Map<string, ImageRef> {
  if (node instanceof Sprite && node.texture?.valid) {
    const baseTexture = node.texture.baseTexture;
    const source: CanvasImageSource | undefined =
      (baseTexture as unknown as { getDrawableSource?: () => CanvasImageSource }).getDrawableSource?.() ??
      ((baseTexture.resource as unknown as { source?: CanvasImageSource })?.source);
    const key = String(baseTexture.uid);
    if (source && !out.has(key)) {
      out.set(key, {
        key,
        source,
        width: (source as { width?: number }).width ?? node.texture.orig.width,
        height: (source as { height?: number }).height ?? node.texture.orig.height,
      });
    }
  }
  if (node instanceof Container) {
    for (const child of node.children) collectSpriteImages(child, out);
  }
  return out;
}
