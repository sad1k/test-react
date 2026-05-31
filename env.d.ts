/// <reference types="vite/client" />

// Дополнительные переменные окружения, которые читает приложение.
interface ImportMetaEnv {
  /**
   * Базовый путь к кастомной сборке CanvasKit с включённым PDF-бэкендом
   * (например, "/canvaskit/"). Если не задан — используется npm-сборка
   * canvaskit-wasm без PDF, и экспорт идёт через векторный fallback (pdf-lib).
   */
  readonly VITE_CANVASKIT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
