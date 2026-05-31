import { Graphics } from 'pixi.js-legacy';
import { CONFIG } from '../config';

let counter = 0;

const PALETTE = [0xff5252, 0xffb142, 0xfff200, 0x2ed573, 0x18dcff, 0x7d5fff, 0xff6b81, 0xffffff];

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Создаёт случайную фигуру или линию (`PIXI.Graphics`) со случайными
 * цветом, позицией, поворотом и масштабом. Объект интерактивен — на нём
 * работают pointer-события на обоих холстах.
 */
export function createRandomShape(): Graphics {
  const g = new Graphics();
  const color = pick(PALETTE);

  switch (Math.floor(rand(0, 4))) {
    case 0: // прямоугольник
      g.beginFill(color, rand(0.6, 1))
        .drawRect(-rand(20, 60), -rand(20, 60), rand(50, 130), rand(50, 130))
        .endFill();
      break;
    case 1: // круг
      g.beginFill(color, rand(0.6, 1)).drawCircle(0, 0, rand(24, 64)).endFill();
      break;
    case 2: { // ломаная линия
      g.lineStyle(rand(3, 10), color, 1);
      g.moveTo(0, 0);
      const segments = Math.floor(rand(2, 5));
      for (let i = 0; i < segments; i++) g.lineTo(rand(-90, 90), rand(-90, 90));
      break;
    }
    default: // эллипс
      g.beginFill(color, rand(0.5, 0.9)).drawEllipse(0, 0, rand(34, 96), rand(22, 64)).endFill();
      break;
  }

  g.position.set(rand(70, CONFIG.width - 70), rand(70, CONFIG.height - 70));
  g.angle = rand(0, 360);
  g.scale.set(rand(0.7, 1.4));

  g.name = `random#${++counter}`;
  g.eventMode = 'static';
  g.cursor = 'pointer';
  g.on('pointerdown', () => console.log(`${g.name} pointerdown!`));
  g.on('pointerup', () => console.log(`${g.name} pointerup!`));

  return g;
}
