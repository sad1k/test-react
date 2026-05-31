import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конфигурация Vite.
// CanvasKit поставляется как CommonJS/UMD-glue + .wasm. Его НУЖНО пред-бандлить
// (optimizeDeps.include), чтобы esbuild добавил CJS→ESM-интероп (default-экспорт
// для `import CanvasKitInit from 'canvaskit-wasm'`) и заглушил node-импорты fs/path.
// Локатор .wasm мы переопределяем сами через locateFile (см. src/skia/canvaskit.ts).
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    include: ['canvaskit-wasm'],
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
