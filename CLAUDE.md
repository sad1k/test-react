# CLAUDE.md

Контекст проекта для Claude Code и других AI-ассистентов, работающих с этим
репозиторием. Цель файла — быстро ввести в курс дела: что это, как устроено,
что можно сломать и каких соглашений придерживаться.

## О проекте

Веб-приложение: один и тот же `PIXI.Container` рендерится **двумя независимыми
движками** и экспортируется в **векторный PDF**.

- Левый холст — **PixiJS** в режиме canvas-рендера (`forceCanvas: true`).
- Правый холст — **Skia** (CanvasKit, скомпилированный в WASM).
- Обе картинки должны совпадать пиксель-в-пиксель.

Это решение тестового задания на TypeScript: собственная обёртка для отрисовки
Pixi-контейнера средствами Skia, поддержка трансформаций, событий
`pointerdown`/`pointerup` на обоих холстах и экспорт сцены в PDF (вектор для
фигур, bitmap для спрайтов).

## Технологии и жёсткие требования

- **TypeScript** (strict), **React** (только слой UI), **Vite**, менеджер пакетов — **pnpm**.
- **`pixi.js-legacy@7.2.4`**, обязательно с **`forceCanvas: true`** (2D-canvas, без WebGL).
  Версия `-legacy` нужна именно ради canvas-рендерера.
- **`canvaskit-wasm`** — Skia в WASM (рендер на правый холст + опционально PDF).
- **`pdf-lib`** — экспорт PDF по умолчанию (векторный fallback).
- Node.js 18+.

## Команды

```bash
pnpm install
pnpm run make:assets      # генерирует public/assets/sample.png (PNG-спрайт)
pnpm dev                  # http://localhost:5173
pnpm build                # tsc --noEmit && vite build → dist/
pnpm preview              # предпросмотр прод-сборки
pnpm run build:canvaskit  # ОПЦИОНАЛЬНО: тяжёлая сборка CanvasKit с SkPDF (Linux/WSL)
```

`build:canvaskit` **не** запускается автоматически и **не** нужна ни для `dev`,
ни для `build`, ни для деплоя. Это разовый ручной шаг, если нужен «честный» путь
экспорта через Skia PDF backend (см. ниже).

## Ключевая идея архитектуры

Центральная абстракция — бэкенд-независимая «цель рисования» **`VectorTarget`**
(`src/engine/target.ts`):

```ts
interface VectorTarget {
  save(): void;
  restore(): void;
  transform(m: AffineMatrix): void;
  fillPath(path: Path, paint: FillPaint): void;
  strokePath(path: Path, paint: StrokePaint): void;
  drawImage(image: ImageRef, src: Rect, dest: Rect, alpha: number): void;
}
```

Обходчик сцены `drawNode()` (`src/engine/walker.ts`) рекурсивно читает дерево
`PIXI.Container` и транслирует его в вызовы этого интерфейса, **ничего не зная о
конкретном движке**. Благодаря этому один и тот же код рисования обслуживает три
сценария:

```
                    ┌────────────────────────────┐
  PIXI.Container ──▶ │  walker.drawNode()         │  обход дерева, матрицы, стили
   (сцена)          │  (engine/walker.ts)        │
                    └──────────────┬─────────────┘
                                   │  VectorTarget
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                       ▼
    SkiaTarget (экран)     SkiaTarget (страница PDF)   PdfLibTarget
    → CanvasKit.Canvas     → Skia PDF backend (SkPDF)  → векторный PDF (pdf-lib)
```

Поэтому экранный рендер Skia, экспорт через Skia PDF и экспорт через pdf-lib дают
согласованный результат — логика отрисовки не дублируется.


## Поток рендеринга (как получается кадр)

1. `PixiSkiaApp.init()` создаёт `PIXI.Application({ forceCanvas:true, autoStart:false })`,
   загружает CanvasKit, создаёт `SkiaStage`, собирает сцены, вешает события.
2. Текущая сцена (`PIXI.Container`) добавляется в `app.stage`.
3. `renderAll()` вызывает `app.render()` (левый холст + актуализация
   `worldTransform`) и `skia.render(scene)` (правый холст).
4. `renderAll()` дёргается **по требованию**: при инициализации, смене сцены,
   добавлении фигуры. Непрерывного `requestAnimationFrame` нет (см. подводные камни).


## Трансформации

Каждый узел рисуется как `save → transform(localMatrix) → … → restore`.
Композиция локальных матриц вдоль дерева даёт мировую матрицу узла, поэтому
`translate` / `rotate` / `scale` / `pivot` / `skew` и вложенные контейнеры
воспроизводятся корректно. `PIXI.Matrix (a,b,c,d,tx,ty)` ложится без изменений
и в `CanvasKit.Canvas.concat` (3×3), и в PDF-оператор `cm`.

## События на обоих холстах

- **Левый холст (PixiJS)** — нативная система событий. Объекты помечаются
  `eventMode = 'static'`; события всплывают до `stage`, где логируются.
- **Правый холст (Skia)** — собственный `hitTest` (`src/events/hitTest.ts`) +
  мост `pointerBridge.ts`. Найденному объекту ретранслируется событие через
  `emit(...)`, поэтому те же обработчики `.on('pointerdown'|'pointerup')`
  срабатывают одинаково на обоих холстах.

## Экспорт в PDF

- **По умолчанию (`pdf-lib`).** `PdfLibTarget` пишет сырые операторы потока
  содержимого (`cm`, `m`/`l`/`c`, `re`, `f`/`S`, `rg`/`RG`). Фигуры и линии —
  **векторные**, спрайты встраиваются как растровые XObject (`embedPng`).
  Работает из коробки и на Vercel.
- **Опционально (Skia PDF backend).** При кастомной сборке CanvasKit тот же
  `SkiaTarget` рисует на canvas страницы PDF — вектор «бесплатно», тем же кодом.
  Данный проект — самый лучший из всех кандидатов.
  Включается переменной `VITE_CANVASKIT_PATH=/canvaskit/`.

## Кастомная сборка CanvasKit с PDF (когда нужна)

npm-пакет `canvaskit-wasm` **не** содержит PDF-биндингов. Чтобы экспортировать
через Skia PDF, нужно собрать CanvasKit из исходников, прикомпилировав
`scripts/canvaskit-pdf-bindings.cpp` (embind над `SkPDF`):

```bash
pnpm run build:canvaskit   # Linux/macOS или WSL; git, python3, ninja, ~20 ГБ
```

Скрипт кладёт `canvaskit.js` + `canvaskit.wasm` в `public/canvaskit/` (бинарники
в git не коммитятся). `src/skia/canvaskit.ts` грузит их, а `isSkiaPdfAvailable()`
определяет, доступен ли путь Skia PDF; иначе используется fallback на pdf-lib.

## Структура `src/`

```
engine/            # ФРЕЙМВОРК-НЕЗАВИСИМОЕ ЯДРО
├── target.ts      # интерфейс VectorTarget + типы Path/Paint/Rect/ImageRef
├── walker.ts      # drawNode(): PIXI.Container → VectorTarget  ← «обёртка»
├── geometry.ts    # построение контуров (порт из @pixi/canvas-graphics)
├── matrix.ts      # AffineMatrix, перевод в матрицу Skia
└── color.ts       # цвет → RGB, tint, аппроксимация альфы для pdf-lib
skia/
├── canvaskit.ts   # загрузка CanvasKit (+ детект PDF-бэкенда)
├── SkiaTarget.ts  # VectorTarget поверх CanvasKit.Canvas
└── SkiaStage.ts   # поверхность Skia + перерисовка сцены
pdf/
├── exportPdf.ts   # выбор пути экспорта (Skia PDF / pdf-lib)
├── PdfLibTarget.ts# VectorTarget поверх pdf-lib
└── pngBytes.ts    # спрайт → PNG-байты для встраивания
events/
├── hitTest.ts     # hit-test по дереву (как EventBoundary PixiJS)
└── pointerBridge.ts # pointer-события Skia-холста → PixiJS
scenes/
├── scenes.ts      # сцены (вкл. пример из ТЗ один-в-один)
└── randomShapes.ts# генератор случайных фигур
app/PixiSkiaApp.ts # оркестратор: PixiJS + Skia + PDF + события
ui/                # React: App, Toolbar, EventLog, usePixiSkiaApp
```

## Подводные камни и граничные случаи

- **Рендер по требованию.** `autoStart: false` + ручной `renderAll()`. Непрерывный
  rAF гонял бы пересборку путей/красок в WASM каждый кадр впустую и мешал
  стабильному снятию скриншотов. Если появится анимация — вернуть тикер.
- **Hit-test принимает мировую точку.** `Graphics.containsPoint` /
  `Sprite.containsPoint` в PixiJS **сами** инвертируют `worldTransform`. Передавать
  глобальную точку, НЕ локальную (иначе двойная инверсия и ложные попадания).
- **Skia-поверхность — программная** (`MakeSWCanvasSurface`): совместимость без
  GPU и в headless. Для небольших сцен с рендером по требованию этого достаточно.
- **Vite.** `canvaskit-wasm` стоит в `optimizeDeps.include` — иначе нет
  default-экспорта `CanvasKitInit` (CJS/UMD-glue без интеропа). Путь к `.wasm`
  переопределяется через `locateFile`.
- **Геометрия портирована из canvas-рендерера PixiJS** (`kappa`-эллипс, скруглённый
  прямоугольник, позиционирование спрайта), чтобы вывод Skia совпадал с PixiJS.
- **Альфа в pdf-lib** аппроксимируется смешением с белым фоном; в Skia PDF — честная.
- Спрайты обрабатываются как цельные текстуры (атлас-rotate/trim и tint не учтены).
- Комментарии в коде — на русском.

## Технические решения и обоснования

- **`VectorTarget` вместо прямого вызова CanvasKit** — чтобы не дублировать логику
  рендера между экраном и PDF и гарантировать согласованность.
- **Порт геометрии из самого PixiJS**, а не «на глаз» — готовой обёртки Pixi→Skia
  не существует (открытый запрос pixijs/pixijs#7470), а canvas-рендерер PixiJS —
  эталон «как нарисовать `PIXI.Container` в 2D-API».
- **Одна `PIXI.Container` как источник истины** — и для PixiJS, и для Skia, и для
  PDF, и для hit-теста; ничего не рассинхронизируется.