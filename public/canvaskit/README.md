# Кастомная сборка CanvasKit (с PDF-бэкендом)

Эта папка предназначена для **кастомной** сборки CanvasKit, включающей PDF-бэкенд
Skia (`SkPDF`). Стандартный npm-пакет `canvaskit-wasm` PDF не содержит.

## Как получить файлы

Запустите (на Linux/macOS или в WSL):

```bash
pnpm run build:canvaskit
```

Скрипт `scripts/build-canvaskit-pdf.sh` соберёт Skia + CanvasKit, прикомпилировав
PDF-биндинги из `scripts/canvaskit-pdf-bindings.cpp`, и положит сюда два файла:

- `canvaskit.js`   — UMD-glue, определяющий глобальный `CanvasKitInit`;
- `canvaskit.wasm` — бинарь Skia с PDF.

Эти бинарники намеренно **не** коммитятся в репозиторий (см. `.gitignore`).

## Как включить

Запустите приложение, указав путь к кастомной сборке:

```bash
VITE_CANVASKIT_PATH=/canvaskit/ pnpm dev
```

После этого экспорт в PDF пойдёт «честным» путём через Skia PDF backend
(тем же кодом рендеринга, что и на экран). Без этих файлов приложение использует
векторный fallback на `pdf-lib` — он тоже даёт настоящую векторную графику.
