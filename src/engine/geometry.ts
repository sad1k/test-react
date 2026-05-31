import type { Path } from './target';

/**
 * Построители контуров для примитивов PixiJS.
 *
 * Геометрия портирована «один-в-один» из канвас-рендерера PixiJS
 * (`@pixi/canvas-graphics` → `CanvasGraphicsRenderer`): тот же коэффициент
 * `kappa` для эллипса, та же последовательность кривых для скруглённого
 * прямоугольника. Это гарантирует, что кривые на Skia/PDF совпадут
 * с тем, что PixiJS рисует на своём canvas-холсте — кривая в кривую.
 *
 * Параметр `expand` сдвигает границу контура наружу (или внутрь при
 * отрицательном значении) — так PixiJS реализует `lineStyle.alignment`,
 * отличный от 0.5: смещение = `lineWidth · (alignment − 0.5)`.
 */

// Точное значение, которое использует сам PixiJS.
const KAPPA = 0.5522848;

/** Прямоугольник (M-L-L-L-Z). */
export function rectPath(x: number, y: number, w: number, h: number, expand = 0): Path {
  const X = x - expand;
  const Y = y - expand;
  const W = w + 2 * expand;
  const H = h + 2 * expand;
  return [
    { t: 'M', x: X, y: Y },
    { t: 'L', x: X + W, y: Y },
    { t: 'L', x: X + W, y: Y + H },
    { t: 'L', x: X, y: Y + H },
    { t: 'Z' },
  ];
}

/**
 * Эллипс из четырёх кубических кривых Безье.
 * `cx, cy` — центр, `halfW, halfH` — полуоси (как у `PIXI.Ellipse`).
 */
export function ellipsePath(cx: number, cy: number, halfW: number, halfH: number, expand = 0): Path {
  const w = (halfW + expand) * 2;
  const h = (halfH + expand) * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const ox = (w / 2) * KAPPA;
  const oy = (h / 2) * KAPPA;
  const xe = x + w;
  const ye = y + h;
  const xm = x + w / 2;
  const ym = y + h / 2;
  return [
    { t: 'M', x, y: ym },
    { t: 'C', c1x: x, c1y: ym - oy, c2x: xm - ox, c2y: y, x: xm, y },
    { t: 'C', c1x: xm + ox, c1y: y, c2x: xe, c2y: ym - oy, x: xe, y: ym },
    { t: 'C', c1x: xe, c1y: ym + oy, c2x: xm + ox, c2y: ye, x: xm, y: ye },
    { t: 'C', c1x: xm - ox, c1y: ye, c2x: x, c2y: ym + oy, x, y: ym },
    { t: 'Z' },
  ];
}

/** Окружность — частный случай эллипса с равными полуосями. */
export function circlePath(cx: number, cy: number, radius: number, expand = 0): Path {
  return ellipsePath(cx, cy, radius, radius, expand);
}

/** Скруглённый прямоугольник (прямые отрезки + квадратичные кривые в углах). */
export function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  expand = 0,
): Path {
  const rx = x - expand;
  const ry = y - expand;
  const width = w + 2 * expand;
  const height = h + 2 * expand;
  const maxRadius = Math.min(width, height) / 2;
  let r = radius + expand;
  if (r > maxRadius) r = maxRadius;
  if (r < 0) r = 0;
  return [
    { t: 'M', x: rx, y: ry + r },
    { t: 'L', x: rx, y: ry + height - r },
    { t: 'Q', cx: rx, cy: ry + height, x: rx + r, y: ry + height },
    { t: 'L', x: rx + width - r, y: ry + height },
    { t: 'Q', cx: rx + width, cy: ry + height, x: rx + width, y: ry + height - r },
    { t: 'L', x: rx + width, y: ry + r },
    { t: 'Q', cx: rx + width, cy: ry, x: rx + width - r, y: ry },
    { t: 'L', x: rx + r, y: ry },
    { t: 'Q', cx: rx, cy: ry, x: rx, y: ry + r },
    { t: 'Z' },
  ];
}

/**
 * Полилиния / полигон. Покрывает `moveTo`/`lineTo` (PixiJS складывает их
 * в одну `Polygon` с `closeStroke=false`) и `drawPolygon`.
 * `points` — плоский массив [x0,y0,x1,y1,...].
 */
export function polyPath(points: number[], closed: boolean): Path {
  const cmds: Path = [];
  if (!points || points.length < 4) return cmds;
  cmds.push({ t: 'M', x: points[0], y: points[1] });
  for (let i = 2; i < points.length; i += 2) {
    cmds.push({ t: 'L', x: points[i], y: points[i + 1] });
  }
  if (closed) cmds.push({ t: 'Z' });
  return cmds;
}
