# PixiJS → Skia → PDF

Приложение на **TypeScript + React**, которое рендерит один и тот же
`PIXI.Container` двумя движками — **PixiJS** (canvas-рендер, `forceCanvas`) и
**Skia** (CanvasKit/WASM) — и экспортирует сцену в **векторный PDF**.

> Это решение тестового задания: собственная обёртка для отрисовки Pixi-контейнера
> средствами Skia, поддержка трансформаций, событий `pointerdown`/`pointerup` на
> обоих холстах и экспорт в PDF (векторный для фигур, растровый для спрайтов).

---

## Что внутри

- 🎨 **Обёртка PixiJS → Skia.** Дерево `PIXI.Container` обходится и отрисовывается
  средствами CanvasKit. Поддержаны `PIXI.Graphics` (`drawRect`, `drawShape`,
  `moveTo`/`lineTo`, эллипсы, круги, скруглённые прямоугольники) и `PIXI.Sprite`
  (PNG). Учитываются трансформации **translate / rotate / scale** (в т.ч.
  вложенные контейнеры), прозрачность, цвет, стиль линий.
- 🖱 **События на обоих холстах.** `pointerdown` / `pointerup` работают и на
  холсте PixiJS (нативная система событий), и на холсте Skia (собственный
  hit-test, ретранслирующий события в систему PixiJS). Хит-тест на обоих холстах
  даёт одинаковый результат.
- 📄 **Экспорт в PDF.** Результат **векторный** (пути Безье, а не картинка).
  Спрайты встраиваются как растр (bitmap) — как и требует ТЗ. Доступны два пути:
  - по умолчанию — через `pdf-lib` (работает из коробки, в т.ч. на Vercel);
  - опционально — через **Skia PDF backend** (`SkPDF`) при кастомной сборке WASM.
- 🧩 **Интерактивность:** кнопка «добавить случайную фигуру/линию», переключение
  между несколькими подготовленными сценами (вручную и по таймеру).

---

## Технологии

| Назначение            | Пакет                                  |
| --------------------- | -------------------------------------- |
| Рендер-движок №1      | `pixi.js-legacy@7.2.4` (`forceCanvas`) |
| Рендер-движок №2      | `canvaskit-wasm` (Skia в WASM)         |
| Экспорт PDF (fallback)| `pdf-lib`                              |
| UI                    | `react` + `react-dom`                  |
| Сборка / dev-сервер   | `vite`                                 |
| Язык                  | `typescript` (strict)                  |

> PixiJS используется именно в варианте **`-legacy`** и с **`forceCanvas: true`** —
> как требует задание (рендер на 2D-canvas, без WebGL).

---

## Быстрый старт

```bash
# 1. Установить зависимости (используется pnpm)
pnpm install

# 2. Сгенерировать демонстрационный PNG-спрайт (public/assets/sample.png)
pnpm run make:assets

# 3. Запустить dev-сервер
pnpm dev
# открыть http://localhost:5173
```

Прод-сборка и предпросмотр:

```bash
pnpm build      # tsc --noEmit + vite build → dist/
pnpm preview    # локальный предпросмотр сборки
```

> Нужен Node.js 18+ и `pnpm` (`npm i -g pnpm` или `corepack enable`).

### Как пользоваться

- **＋ Случайная фигура / линия** — добавляет случайный `PIXI.Graphics` в текущую
  сцену; обновляются оба холста.
- **⟳ Следующая сцена** — переключает заранее заготовленные `PIXI.Container`.
- **Авто-переключение (3 с)** — то же по таймеру `setInterval`.
- **⬇ Экспорт в PDF** — выгружает текущую сцену в PDF-файл.
- Кликайте по фигурам на **любом** холсте — события появляются в «Журнале событий»
  (источник `PIXI` или `SKIA`), а обработчики `.on('pointerdown'|'pointerup')`
  срабатывают одинаково.

---

## Архитектура

Ключевая идея — **бэкенд-независимая «цель рисования»** `VectorTarget`. Обходчик
сцены читает `PIXI.Container` и транслирует его в вызовы этого интерфейса, ничего
не зная о конкретном движке. Это даёт три применения одному и тому же коду:

```
                         ┌────────────────────────────┐
   PIXI.Container ──────▶│   walker.drawNode()         │  обход дерева,
   (сцена)               │   (engine/walker.ts)        │  матрицы, стили
                         └──────────────┬─────────────┘
                                        │ VectorTarget (engine/target.ts)
              ┌─────────────────────────┼──────────────────────────┐
              ▼                         ▼                          ▼
      SkiaTarget (экран)       SkiaTarget (PDF-страница)     PdfLibTarget
      skia/SkiaTarget.ts        — Skia PDF backend            pdf/PdfLibTarget.ts
      → CanvasKit.Canvas        (кастомная WASM-сборка)       → векторный PDF
```

Один обходчик → экранный рендер Skia, экспорт через Skia PDF и экспорт через
pdf-lib дают **пиксель-в-пиксель согласованный** результат.

### Откуда «правильная» геометрия

Готовой обёртки PixiJS → Skia не существует (есть лишь открытый запрос фичи
[pixijs/pixijs#7470](https://github.com/pixijs/pixijs/discussions/7470)). При этом
у самого PixiJS есть **canvas-рендерер** (`@pixi/canvas-graphics`,
`@pixi/canvas-sprite`) — это и есть эталонная реализация «отрисовать
`PIXI.Container` в 2D-API». В v8 его убрали, поэтому версия **7.x-legacy** —
лучший ориентир. Геометрия (коэффициент `kappa` для эллипса, построение
скруглённого прямоугольника, формула позиционирования спрайта, выравнивание
линий) портирована из этого рендерера один-в-один — так вывод Skia совпадает
с тем, что PixiJS рисует на своём холсте.

### Структура проекта

```
src/
├── config.ts                 # размеры сцены, путь к спрайту
├── main.tsx                  # точка входа React
├── style.css
├── engine/                   # ФРЕЙМВОРК-НЕЗАВИСИМОЕ ЯДРО
│   ├── target.ts             # интерфейс VectorTarget + типы Path/Paint
│   ├── matrix.ts             # аффинная матрица (общий язык трансформаций)
│   ├── color.ts              # цвета, tint, аппроксимация альфы
│   ├── geometry.ts           # построение контуров (порт из PixiJS)
│   └── walker.ts             # обход PIXI.Container → VectorTarget  ← «обёртка»
├── skia/
│   ├── canvaskit.ts          # загрузка CanvasKit (+ детект PDF-бэкенда)
│   ├── SkiaTarget.ts         # VectorTarget поверх CanvasKit.Canvas
│   └── SkiaStage.ts          # поверхность Skia + перерисовка сцены
├── pdf/
│   ├── exportPdf.ts          # выбор пути экспорта (Skia PDF / pdf-lib)
│   ├── PdfLibTarget.ts       # VectorTarget поверх pdf-lib (векторный PDF)
│   └── pngBytes.ts           # спрайт → PNG-байты для встраивания
├── events/
│   ├── hitTest.ts            # hit-test по дереву сцены (как у PixiJS)
│   └── pointerBridge.ts      # pointer-события Skia-холста → PixiJS
├── scenes/
│   ├── scenes.ts             # сцены (в т.ч. пример из ТЗ один-в-один)
│   └── randomShapes.ts       # генератор случайных фигур
├── app/
│   └── PixiSkiaApp.ts        # оркестратор (PixiJS + Skia + PDF + события)
└── ui/                       # React-слой (только UI)
    ├── App.tsx, Toolbar.tsx, EventLog.tsx
    └── usePixiSkiaApp.ts      # хук-мост между движком и React
scripts/
├── make-sample-png.mjs        # генерация PNG-спрайта
├── build-canvaskit-pdf.sh     # сборка кастомного CanvasKit с PDF
└── canvaskit-pdf-bindings.cpp  # embind-биндинги SkPDF
```

### Трансформации

Каждый узел рисуется как `save → transform(localMatrix) → … → restore`.
Композиция локальных матриц вдоль дерева в точности даёт мировую матрицу узла,
поэтому `translate` / `rotate` / `scale` / `pivot` / `skew` и вложенные
контейнеры воспроизводятся корректно. Матрица `PIXI.Matrix (a,b,c,d,tx,ty)`
напрямую ложится и в `CanvasKit.Canvas.concat`, и в PDF-оператор `cm`.

### События на обоих холстах

- **Холст PixiJS** — нативная система событий PixiJS. Объекты помечаются
  `eventMode = 'static'`; события всплывают до `stage`, где логируются.
- **Холст Skia** — собственный `hitTest` (`events/hitTest.ts`), повторяющий
  логику `EventBoundary` PixiJS: `Graphics.containsPoint` / `Sprite.containsPoint`
  принимают мировую точку и сами инвертируют `worldTransform`. Найденному объекту
  ретранслируется событие через `emit(...)`, поэтому те же обработчики `.on(...)`
  срабатывают одинаково на обоих холстах.

### Экспорт в PDF

- **По умолчанию (pdf-lib).** `PdfLibTarget` пишет «сырые» операторы потока
  содержимого PDF (`cm`, `m`/`l`/`c`, `re`, `f`/`S`, `rg`/`RG`). Фигуры и линии
  остаются **векторными** (кривые Безье и отрезки), спрайты встраиваются как
  растровые XObject (`embedPng`) — как требует ТЗ. Работает из коробки и на Vercel.
- **Опционально (Skia PDF backend).** При кастомной сборке CanvasKit с `SkPDF`
  тот же `SkiaTarget` рисует на canvas страницы PDF — векторный вывод получается
  тем же кодом, что и на экране. См. ниже.

---

## Кастомная сборка CanvasKit с PDF (опционально)

npm-пакет `canvaskit-wasm` не включает PDF-бэкенд. Чтобы экспортировать через
**Skia PDF**, нужно собрать CanvasKit из исходников, прикомпилировав биндинги
`scripts/canvaskit-pdf-bindings.cpp`:

```bash
# Linux/macOS или WSL; требуется git, python3, ninja, ~20 ГБ диска.
pnpm run build:canvaskit
```

Скрипт положит `canvaskit.js` и `canvaskit.wasm` в `public/canvaskit/`. После этого:

```bash
VITE_CANVASKIT_PATH=/canvaskit/ pnpm dev
```

и экспорт PDF пойдёт через Skia PDF backend (статус в подвале это покажет).
Подробности — в `public/canvaskit/README.md`.

---

## Деплой

### GitHub

```bash
git init
git add .
git commit -m "PixiJS → Skia → PDF"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### Vercel

Проект готов к деплою на Vercel (есть `vercel.json`):

1. Импортируйте репозиторий на [vercel.com](https://vercel.com/new).
2. Framework — **Vite** (определяется автоматически).
   - Build command: `pnpm build`
   - Output directory: `dist`
3. Deploy.

`vercel.json` дополнительно отдаёт `.wasm` с правильным `Content-Type`.
Кастомная сборка CanvasKit для деплоя не нужна — на Vercel работает векторный
экспорт через `pdf-lib`.

---

## Известные ограничения

- В fallback на `pdf-lib` полупрозрачность аппроксимируется смешением с белым
  фоном (страница всегда белая). В пути через Skia PDF — честная альфа.
- Спрайты обрабатываются как цельные текстуры; поворот/обрезка из атласов
  (`texture.rotate`, trimming) и `tint` спрайтов не учитываются.
- Невыровненная по центру обводка (`lineStyle.alignment ≠ 0.5`) для полилиний
  аппроксимируется центрированной (для прямоугольников/эллипсов/кругов смещение
  учтено точно).
- Skia-холст использует программную (CPU) поверхность — максимально совместимо
  (в т.ч. headless/без GPU); для небольших сцен с рендером по требованию этого
  достаточно.
