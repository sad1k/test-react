import { usePixiSkiaApp } from './usePixiSkiaApp';
import { Toolbar } from './Toolbar';
import { EventLog } from './EventLog';

/** Корневой компонент UI. */
export function App() {
  const api = usePixiSkiaApp();

  const statusClass =
    api.status.state === 'ready' ? 'ok' : api.status.state === 'error' ? 'err' : 'warn';

  return (
    <div id="app">
      <header className="app-header">
        <h1>
          PixiJS&nbsp;→&nbsp;Skia&nbsp;→&nbsp;PDF
        </h1>
        <p className="subtitle">
          Рендер одного <code>PIXI.Container</code> на двух движках и векторный экспорт в PDF
        </p>
      </header>

      <Toolbar
        sceneName={api.sceneName}
        exporting={api.exporting}
        onRandom={api.addRandomShape}
        onNextScene={api.nextScene}
        onToggleAutoplay={api.toggleAutoplay}
        onExport={api.exportPdf}
      />

      <section className="stage-row">
        <figure className="stage">
          <figcaption>
            <span className="dot dot-pixi" /> PixiJS&nbsp;<small>(forceCanvas)</small>
          </figcaption>
          <div className="canvas-box">
            <canvas ref={api.pixiCanvasRef} />
          </div>
        </figure>

        <figure className="stage">
          <figcaption>
            <span className="dot dot-skia" /> Skia&nbsp;<small>(CanvasKit / WASM)</small>
          </figcaption>
          <div className="canvas-box">
            <canvas ref={api.skiaCanvasRef} />
          </div>
        </figure>
      </section>

      <EventLog events={api.events} onClear={api.clearEvents} />

      <footer className="app-footer">
        <span className={`status ${statusClass}`}>{api.status.message}</span>
      </footer>
    </div>
  );
}
