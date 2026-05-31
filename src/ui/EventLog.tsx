import type { LogEntry } from '../app/PixiSkiaApp';

interface EventLogProps {
  events: LogEntry[];
  onClear: () => void;
}

/** Журнал pointer-событий с обоих холстов. */
export function EventLog({ events, onClear }: EventLogProps) {
  return (
    <section className="log-panel">
      <div className="log-head">
        <strong>Журнал событий</strong>
        <small>pointerdown / pointerup работают на обоих холстах</small>
        <button type="button" className="ghost" onClick={onClear}>
          Очистить
        </button>
      </div>
      <ul className="event-log">
        {events.length === 0 ? (
          <li className="empty">Кликните по фигуре на любом из холстов…</li>
        ) : (
          events.map((e) => (
            <li key={e.id}>
              <span className={`ev-src src-${e.source}`}>{e.source.toUpperCase()}</span>
              <span className={e.type === 'pointerdown' ? 'ev-type-down' : 'ev-type-up'}>{e.type}</span>
              <span className="ev-target">{e.target}</span>
              <span className="ev-time">
                ({e.x}, {e.y})
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
