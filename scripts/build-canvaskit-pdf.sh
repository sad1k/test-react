#!/usr/bin/env bash
#
# Сборка кастомной WASM-версии CanvasKit с PDF-бэкендом Skia (SkPDF).
#
# Зачем: npm-пакет canvaskit-wasm не включает PDF-биндинги, поэтому «честный»
# экспорт через Skia PDF недоступен из коробки. Этот скрипт собирает CanvasKit
# из исходников Skia, прикомпилировав scripts/canvaskit-pdf-bindings.cpp,
# и кладёт результат в public/canvaskit/. После этого достаточно задать
# переменную окружения VITE_CANVASKIT_PATH=/canvaskit/ — и приложение начнёт
# экспортировать PDF через SkPDF (см. src/skia/canvaskit.ts, src/pdf/exportPdf.ts).
#
# ВНИМАНИЕ: сборка тяжёлая и предназначена для Linux/macOS или WSL.
#   Требуется: git, python3, ninja, ~20 ГБ диска и эмскриптен (emsdk).
#   Полная сборка занимает 20–60+ минут. На Windows запускайте через WSL.
#
# Скрипт идемпотентен: повторный запуск переиспользует уже скачанные исходники.

set -euo pipefail

# --- Пути -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WORK_DIR="${CANVASKIT_BUILD_DIR:-${PROJECT_DIR}/.canvaskit-build}"
OUT_DIR="${PROJECT_DIR}/public/canvaskit"
BINDINGS_SRC="${SCRIPT_DIR}/canvaskit-pdf-bindings.cpp"

mkdir -p "${WORK_DIR}" "${OUT_DIR}"

echo "==> Рабочая директория: ${WORK_DIR}"
echo "==> Результат будет в:   ${OUT_DIR}"

# --- 1. Emscripten (emsdk) --------------------------------------------------
if ! command -v emcc >/dev/null 2>&1; then
  echo "==> Устанавливаю emsdk (Emscripten)…"
  if [ ! -d "${WORK_DIR}/emsdk" ]; then
    git clone https://github.com/emscripten-core/emsdk.git "${WORK_DIR}/emsdk"
  fi
  (cd "${WORK_DIR}/emsdk" && ./emsdk install latest && ./emsdk activate latest)
  # shellcheck source=/dev/null
  source "${WORK_DIR}/emsdk/emsdk_env.sh"
else
  echo "==> Использую системный emcc: $(command -v emcc)"
fi

# --- 2. depot_tools (для синхронизации зависимостей Skia) -------------------
if [ ! -d "${WORK_DIR}/depot_tools" ]; then
  echo "==> Клонирую depot_tools…"
  git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git "${WORK_DIR}/depot_tools"
fi
export PATH="${WORK_DIR}/depot_tools:${PATH}"

# --- 3. Исходники Skia ------------------------------------------------------
if [ ! -d "${WORK_DIR}/skia" ]; then
  echo "==> Клонирую Skia…"
  git clone https://skia.googlesource.com/skia.git "${WORK_DIR}/skia"
fi
cd "${WORK_DIR}/skia"
echo "==> Синхронизирую зависимости Skia (python3 tools/git-sync-deps)…"
python3 tools/git-sync-deps

# --- 4. Прикомпиляция наших PDF-биндингов -----------------------------------
# Добавляем содержимое canvaskit-pdf-bindings.cpp к основному файлу биндингов
# CanvasKit (несколько блоков EMSCRIPTEN_BINDINGS допустимы). Делаем это
# идемпотентно — по маркеру.
CK_BINDINGS="modules/canvaskit/canvaskit_bindings.cpp"
MARKER="// >>> pixi-skia-pdf: SkPDF backend bindings"
if ! grep -q "${MARKER}" "${CK_BINDINGS}"; then
  echo "==> Добавляю PDF-биндинги в ${CK_BINDINGS}"
  {
    echo ""
    echo "${MARKER}"
    cat "${BINDINGS_SRC}"
  } >> "${CK_BINDINGS}"
else
  echo "==> PDF-биндинги уже добавлены — пропускаю"
fi

# --- 5. Сборка CanvasKit ----------------------------------------------------
# compile.sh использует GN-аргументы. PDF-бэкенд Skia включаем явным образом.
echo "==> Собираю CanvasKit (это надолго)…"
export EMSDK="${EMSDK:-${WORK_DIR}/emsdk}"
# Включаем PDF и нужные кодеки; полноценная сборка кладёт результат в out/canvaskit_wasm.
./modules/canvaskit/compile.sh \
  release \
  skia_use_pdf=true \
  skia_enable_pdf=true

# --- 6. Копирование результата ---------------------------------------------
BUILD_OUT="out/canvaskit_wasm"
echo "==> Копирую canvaskit.js и canvaskit.wasm в ${OUT_DIR}"
cp "${BUILD_OUT}/canvaskit.js" "${OUT_DIR}/canvaskit.js"
cp "${BUILD_OUT}/canvaskit.wasm" "${OUT_DIR}/canvaskit.wasm"

echo ""
echo "✓ Готово. Кастомный CanvasKit с PDF-бэкендом лежит в ${OUT_DIR}"
echo "  Теперь запустите приложение с VITE_CANVASKIT_PATH=/canvaskit/, например:"
echo "    VITE_CANVASKIT_PATH=/canvaskit/ pnpm dev"
echo "  и экспорт PDF пойдёт через Skia PDF backend."
