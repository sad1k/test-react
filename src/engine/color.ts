/** RGB-цвет с компонентами в диапазоне 0..1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Зажимает число в диапазон [0, 1]. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Раскладывает целочисленный цвет `0xRRGGBB` в {@link Rgb} (0..1). */
export function intToRgb(color: number): Rgb {
  const c = color >>> 0;
  return {
    r: ((c >> 16) & 0xff) / 255,
    g: ((c >> 8) & 0xff) / 255,
    b: (c & 0xff) / 255,
  };
}

/**
 * Покомпонентное умножение цветов — так PixiJS применяет `tint`
 * (по умолчанию белый 0xffffff, т.е. умножение на 1 ничего не меняет).
 */
export function multiplyRgb(a: Rgb, b: Rgb): Rgb {
  return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b };
}

/**
 * Аппроксимация полупрозрачности «поверх белого фона».
 *
 * Используется только в PDF-fallback на pdf-lib, где включение настоящего
 * альфа-канала потребовало бы регистрации ExtGState. Так как фон страницы
 * всегда белый, смешивание цвета с белым визуально эквивалентно прозрачности
 * для непересекающихся фигур. В основном (Skia) пути используется честная альфа.
 */
export function blendOverWhite(c: Rgb, alpha: number): Rgb {
  const a = clamp01(alpha);
  return {
    r: c.r * a + (1 - a),
    g: c.g * a + (1 - a),
    b: c.b * a + (1 - a),
  };
}
