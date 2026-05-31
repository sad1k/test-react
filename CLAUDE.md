# CLAUDE.md

Контекст проекта для Claude Code и других AI-ассистентов, работающих с этим репозиторием.

## О проекте

Веб-приложение: один и тот же `PIXI.Container` рендерится двумя движками —
**PixiJS** (canvas-рендер, `forceCanvas`) и **Skia** (CanvasKit/WASM) — и
экспортируется в **векторный PDF**. Решение тестового задания на TypeScript.

## Технологии и жёсткие требования

- **TypeScript** (strict), **React** (только UI), **Vite**, пакетный менеджер — **pnpm**.
- **`pixi.js-legacy@7.2.4`**, обязательно с **`forceCanvas: true`** (2D-canvas, без WebGL).
- **`canvaskit-wasm`** (Skia в WASM), **`pdf-lib`** (fallback-экспорт PDF).
- Node.js 18+.

## Команды

```bash
pnpm install
pnpm run make:assets   # генерирует public/assets/sample.png
pnpm dev               # http://localhost:5173
pnpm build             # tsc --noEmit && vite build → dist/
pnpm preview
pnpm run build:canvaskit  # ОПЦИОНАЛЬНО: тяжёлая сборка CanvasKit с SkPDF (Linux/WSL)
```

`build:canvaskit` не нужна для запуска и для деплоя — она только включает «честный»
путь экспорта через Skia PDF backend.

## Архитектура

Ключевая абстракция — бэкенд-независимая «цель рисования» `VectorTarget`.
Обходчик сцены читает `PIXI.Container` и транслирует его в вызовы этого
интерфейса, ничего не зная о конкретном движке.

```
src/
├── engine/            # фреймворк-независимое ядро
│   ├── target.ts      # интерфейс VectorTarget + типы Path/Paint
│   ├── walker.ts      # drawNode(): PIXI.Container → VectorTarget  ← «обёртка»
│   ├── geometry.ts    # построение контуров (порт из canvas-рендерера PixiJS)
│   ├── matrix.ts, color.ts
├── skia/              # SkiaTarget (VectorTarget над CanvasKit.Canvas), SkiaStage, canvaskit.ts
├── pdf/               # exportPdf.ts (выбор пути), PdfLibTarget.ts, pngBytes.ts
├── events/            # hitTest.ts, pointerBridge.ts
├── scenes/            # scenes.ts (вкл. пример из ТЗ), randomShapes.ts
├── app/PixiSkiaApp.ts # оркестратор: PixiJS + Skia + PDF + события
└── ui/                # React: App, Toolbar, EventLog, usePixiSkiaApp
```

## Важные соглашения и подводные камни

- **Рендер по требованию.** PixiJS создаётся с `autoStart: false`; оба холста
  перерисовываются в `PixiSkiaApp.renderAll()` (смена сцены, добавление фигуры,
  инициализация), без непрерывного `requestAnimationFrame`.
- **Hit-test.** `Graphics.containsPoint` / `Sprite.containsPoint` в PixiJS
  принимают **мировую** точку и сами инвертируют `worldTransform`. Передавать
  глобальную точку, НЕ локальную (см. `events/hitTest.ts`).
- **Skia-поверхность** — программная (`MakeSWCanvasSurface`): совместимость без GPU
  и в headless-окружениях.
- **Vite.** `canvaskit-wasm` стоит в `optimizeDeps.include` (нужен CJS→ESM интероп,
  иначе нет default-экспорта `CanvasKitInit`).
- **Экспорт PDF.** По умолчанию через `pdf-lib`; через Skia PDF — только при
  кастомной сборке и `VITE_CANVASKIT_PATH=/canvaskit/`.
- **Геометрия фигур** портирована из canvas-рендерера PixiJS (`@pixi/canvas-graphics`),
  чтобы вывод Skia совпадал с тем, что рисует PixiJS.
- Комментарии в коде — на русском.

## Git

- Коммиты — **одной короткой строкой**, без тела и буллетов.
- Автор — только пользователь (`sad1k`). Без `Co-Authored-By` и любых упоминаний AI.
