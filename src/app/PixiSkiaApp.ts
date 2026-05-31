import {
  Application,
  Assets,
  Container,
  Rectangle,
  type DisplayObject,
  type FederatedPointerEvent,
} from 'pixi.js-legacy';
import type { CanvasKit } from 'canvaskit-wasm';

import { CONFIG } from '../config';
import { loadCanvasKit, isSkiaPdfAvailable } from '../skia/canvaskit';
import { SkiaStage } from '../skia/SkiaStage';
import { buildScenes, type SceneDef } from '../scenes/scenes';
import { createRandomShape } from '../scenes/randomShapes';
import { attachSkiaPointer, type PointerKind, type SkiaHit } from '../events/pointerBridge';
import { exportScenePdf, type PdfExportResult } from '../pdf/exportPdf';

/** Запись в журнале pointer-событий. */
export interface LogEntry {
  id: number;
  source: 'pixi' | 'skia';
  type: PointerKind;
  target: string;
  x: number;
  y: number;
}

/** Текущее состояние приложения для UI. */
export interface AppStatus {
  state: 'loading' | 'ready' | 'error';
  message: string;
}

/** Колбэки в сторону UI (React). */
export interface AppCallbacks {
  onLog: (entry: LogEntry) => void;
  onStatus: (status: AppStatus) => void;
  onScene: (name: string) => void;
}

/**
 * Оркестратор приложения — связывает PixiJS, Skia и PDF-экспорт, не завися
 * от React. UI лишь вызывает его методы и подписывается на колбэки.
 *
 * Одна и та же `PIXI.Container` (текущая сцена) одновременно:
 *  - рендерится PixiJS на левый холст (forceCanvas);
 *  - читается обходчиком и рисуется Skia на правый холст (по тикеру);
 *  - служит источником для экспорта в PDF.
 */
export class PixiSkiaApp {
  private app!: Application;
  private skia!: SkiaStage;
  private ck!: CanvasKit;
  private scenes: SceneDef[] = [];
  private index = 0;
  private current!: Container;
  private detachSkiaPointer?: () => void;
  private autoplayTimer?: number;
  private logId = 0;
  private disposed = false;

  constructor(private readonly cb: AppCallbacks) {}

  /** Инициализация на двух переданных canvas-элементах. */
  async init(pixiCanvas: HTMLCanvasElement, skiaCanvas: HTMLCanvasElement): Promise<void> {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // 1. PixiJS — обязательно forceCanvas (canvas-рендер, без WebGL).
    this.app = new Application({
      view: pixiCanvas,
      forceCanvas: true,
      width: CONFIG.width,
      height: CONFIG.height,
      backgroundColor: 0xffffff,
      antialias: true,
      resolution: dpr,
      autoDensity: true,
      autoStart: false, // рендерим по требованию (renderAll), без непрерывного rAF
    });

    // Включаем систему событий и слушаем всплывающие pointer-события на сцене.
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = new Rectangle(0, 0, CONFIG.width, CONFIG.height);
    this.app.stage.on('pointerdown', (e: FederatedPointerEvent) => this.onPixiPointer('pointerdown', e));
    this.app.stage.on('pointerup', (e: FederatedPointerEvent) => this.onPixiPointer('pointerup', e));

    // 2. CanvasKit (Skia в WASM).
    this.ck = await loadCanvasKit();
    if (this.disposed) return;
    this.skia = new SkiaStage(this.ck, skiaCanvas, CONFIG.width, CONFIG.height, dpr);

    // 3. Предзагрузка спрайта и сборка сцен.
    const texture = await Assets.load(CONFIG.spriteUrl).catch(() => undefined);
    if (this.disposed) return;
    this.scenes = buildScenes(texture ?? undefined);
    this.setScene(0);

    // 4. Pointer-события на Skia-холсте (ретранслируем в систему PixiJS).
    this.detachSkiaPointer = attachSkiaPointer(
      skiaCanvas,
      () => this.current,
      { width: CONFIG.width, height: CONFIG.height },
      (hit) => this.onSkiaPointer(hit),
    );

    const pdfNote = isSkiaPdfAvailable(this.ck)
      ? 'Skia PDF backend доступен'
      : 'экспорт через pdf-lib (векторный)';
    this.cb.onStatus({ state: 'ready', message: `Готово · ${pdfNote}` });
    this.renderAll();
  }

  /**
   * Перерисовывает ОБА холста по требованию (без непрерывного rAF).
   * `app.render()` обновляет canvas-холст PixiJS и актуализирует
   * `worldTransform` (нужно для hit-теста на Skia-холсте), затем сцена
   * зеркалится средствами Skia.
   */
  private renderAll = (): void => {
    if (this.disposed || !this.skia || !this.current) return;
    this.app.render();
    this.skia.render(this.current);
  };

  /** Обработка нативного события PixiJS (левый холст). */
  private onPixiPointer(type: PointerKind, e: FederatedPointerEvent): void {
    const target = e.target as DisplayObject | null;
    if (!target || target === this.app.stage) return; // клик по пустому фону игнорируем
    this.log('pixi', type, target, e.global.x, e.global.y);
  }

  /** Обработка события с Skia-холста: ретранслируем в PixiJS и логируем. */
  private onSkiaPointer(hit: SkiaHit): void {
    // Эмитим событие на объекте — срабатывают те же обработчики .on(...).
    hit.target.emit(hit.kind, {
      type: hit.kind,
      target: hit.target,
      global: { x: hit.x, y: hit.y },
    } as unknown as FederatedPointerEvent);
    this.log('skia', hit.kind, hit.target, hit.x, hit.y);
  }

  private log(source: 'pixi' | 'skia', type: PointerKind, target: DisplayObject, x: number, y: number): void {
    this.cb.onLog({
      id: this.logId++,
      source,
      type,
      target: target.name || target.constructor?.name || 'object',
      x: Math.round(x),
      y: Math.round(y),
    });
  }

  /** Переключение на сцену с индексом `i` (по кругу). */
  setScene(i: number): void {
    if (!this.scenes.length) return;
    if (this.current) this.app.stage.removeChild(this.current);
    this.index = ((i % this.scenes.length) + this.scenes.length) % this.scenes.length;
    this.current = this.scenes[this.index].container;
    this.app.stage.addChild(this.current);
    this.cb.onScene(this.scenes[this.index].name);
    this.renderAll();
  }

  /** Следующая сцена. */
  nextScene(): void {
    this.setScene(this.index + 1);
  }

  /** Добавляет случайную фигуру/линию в текущую сцену. */
  addRandomShape(): void {
    if (this.current) {
      this.current.addChild(createRandomShape());
      this.renderAll();
    }
  }

  /** Включает/выключает авто-переключение сцен по таймеру. */
  setAutoplay(enabled: boolean): void {
    if (this.autoplayTimer !== undefined) {
      window.clearInterval(this.autoplayTimer);
      this.autoplayTimer = undefined;
    }
    if (enabled) {
      this.autoplayTimer = window.setInterval(() => this.nextScene(), 3000);
    }
  }

  /** Экспортирует текущую сцену в PDF. */
  exportPdf(): Promise<PdfExportResult> {
    return exportScenePdf(this.ck, this.current, CONFIG.width, CONFIG.height, this.skia.imageCache);
  }

  /** Освобождает ресурсы (вызывается при размонтировании React-компонента). */
  dispose(): void {
    this.disposed = true;
    if (this.autoplayTimer !== undefined) window.clearInterval(this.autoplayTimer);
    this.detachSkiaPointer?.();
    this.app?.destroy(false, { children: true });
    this.skia?.dispose();
  }
}
