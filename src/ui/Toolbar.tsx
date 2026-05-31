import { useState } from 'react';

interface ToolbarProps {
  sceneName: string;
  exporting: boolean;
  onRandom: () => void;
  onNextScene: () => void;
  onToggleAutoplay: (on: boolean) => void;
  onExport: () => void;
}

/** Панель управления: добавление фигур, переключение сцен, экспорт в PDF. */
export function Toolbar({ sceneName, exporting, onRandom, onNextScene, onToggleAutoplay, onExport }: ToolbarProps) {
  const [autoplay, setAutoplay] = useState(false);

  const handleAutoplay = (checked: boolean): void => {
    setAutoplay(checked);
    onToggleAutoplay(checked);
  };

  return (
    <section className="toolbar" aria-label="Управление">
      <button type="button" onClick={onRandom}>
        ＋ Случайная фигура / линия
      </button>
      <button type="button" onClick={onNextScene}>
        ⟳ Следующая сцена
      </button>
      <label className="switch">
        <input type="checkbox" checked={autoplay} onChange={(e) => handleAutoplay(e.target.checked)} />
        <span>Авто-переключение (3&nbsp;с)</span>
      </label>

      {sceneName && (
        <span className="scene-badge">
          Сцена: <strong>{sceneName}</strong>
        </span>
      )}

      <span className="spacer" />

      <button type="button" className="primary" onClick={onExport} disabled={exporting}>
        {exporting ? '⏳ Экспорт…' : '⬇ Экспорт в PDF'}
      </button>
    </section>
  );
}
