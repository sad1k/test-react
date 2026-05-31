import { Container, Graphics, Sprite, type DisplayObject, type Texture } from 'pixi.js-legacy';
import { CONFIG } from '../config';

export interface SceneDef {
  name: string;
  container: Container;
}

/**
 * Делает объект интерактивным: даёт имя (для журнала событий),
 * включает обработку pointer-событий и курсор-указатель.
 */
function interactive<T extends DisplayObject>(obj: T, name: string): T {
  obj.name = name;
  obj.eventMode = 'static';
  obj.cursor = 'pointer';
  return obj;
}

/** Набор заранее подготовленных сцен для переключения. */
export function buildScenes(sampleTexture?: Texture): SceneDef[] {
  return [
    { name: 'Пример из ТЗ', container: buildExampleScene() },
    { name: 'Спрайты + альфа', container: buildSpriteScene(sampleTexture) },
    { name: 'Вложенные трансформации', container: buildTransformScene() },
  ];
}

/**
 * Сцена из технического задания — воспроизведена один-в-один.
 * Демонстрирует translate / rotate / scale, вложенный контейнер,
 * заливки, линии и обработчики событий.
 */
export function buildExampleScene(): Container {
  const mainContainer = new Container();
  mainContainer.name = 'mainContainer';
  const subContainer = new Container();
  subContainer.name = 'subContainer';

  const g1 = new Graphics();
  const g2 = new Graphics();
  const g3 = new Graphics();
  const g4 = new Graphics();

  g1.beginFill('#ff0000').drawEllipse(0, 0, 200, 100).endFill();
  g1.position.set(200, 100);
  g1.angle = 30;
  interactive(g1, 'g1');
  g1.on('pointerdown', () => console.log('g1 pointerdown!'));

  g2.beginFill('#0000ff').drawRect(-50, -75, 100, 150).endFill();
  g2.position.set(120, 60);
  g2.angle = 15;
  g2.scale.set(1.5, 1.7);
  interactive(g2, 'g2');
  g2.on('pointerup', () => console.log('g2 pointerup!'));

  g3.lineStyle(10, '#ffffff', 1).moveTo(0, 0).lineTo(150, 100);
  g3.angle = -20;
  interactive(g3, 'g3');

  g4.lineStyle(10, '#ffff00', 1).moveTo(0, 70).lineTo(150, -30);
  g4.angle = 20;
  interactive(g4, 'g4');

  subContainer.position.set(75, 50);
  subContainer.addChild(g3, g4);
  mainContainer.addChild(subContainer, g1, g2);

  return mainContainer;
}

/** Сцена со спрайтами (растровые PNG) и фигурой с полупрозрачной заливкой. */
function buildSpriteScene(texture?: Texture): Container {
  const root = new Container();
  root.name = 'spriteScene';

  if (texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.position.set(250, 210);
    sprite.scale.set(0.85);
    sprite.angle = 12;
    interactive(sprite, 'sprite');
    sprite.on('pointerdown', () => console.log('sprite pointerdown!'));
    root.addChild(sprite);

    const sprite2 = new Sprite(texture);
    sprite2.anchor.set(0.5);
    sprite2.position.set(540, 360);
    sprite2.scale.set(0.5);
    sprite2.angle = -18;
    interactive(sprite2, 'sprite2');
    root.addChild(sprite2);
  }

  const circle = new Graphics();
  circle.beginFill('#22cc88', 0.85).drawCircle(0, 0, 72).endFill();
  circle.position.set(560, 150);
  interactive(circle, 'circle');
  root.addChild(circle);

  const poly = new Graphics();
  poly.lineStyle(6, '#ffffff', 1).moveTo(0, 0).lineTo(180, 120).lineTo(30, 170);
  poly.position.set(110, 320);
  poly.angle = 8;
  interactive(poly, 'poly');
  root.addChild(poly);

  return root;
}

/** Сцена с глубоко вложенными трансформациями (контейнер в контейнере). */
function buildTransformScene(): Container {
  const root = new Container();
  root.name = 'transformScene';

  const grid = new Container();
  grid.name = 'grid';
  grid.position.set(CONFIG.width / 2, CONFIG.height / 2);
  grid.angle = 18;
  root.addChild(grid);

  const palette = [0xff5252, 0xffb142, 0x2ed573, 0x1e90ff, 0xa55eea];
  for (let i = 0; i < palette.length; i++) {
    const box = new Graphics();
    box.beginFill(palette[i]).drawRoundedRect(-40, -40, 80, 80, 16).endFill();
    box.position.set((i - 2) * 96, 0);
    box.angle = i * 12;
    box.scale.set(1 + i * 0.08, 1 - i * 0.04);
    interactive(box, `box${i}`);
    box.on('pointerdown', () => console.log(`box${i} pointerdown!`));
    grid.addChild(box);
  }

  const ring = new Graphics();
  ring.lineStyle(10, '#ffffff', 1).drawEllipse(0, 0, 150, 90);
  ring.angle = -10;
  interactive(ring, 'ring');
  grid.addChild(ring);

  return root;
}
