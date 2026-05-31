import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './style.css';

const container = document.getElementById('root');
if (!container) throw new Error('Элемент #root не найден');

// StrictMode намеренно не используется: его двойной вызов эффектов в dev-режиме
// приводил бы к двойной инициализации PixiJS и WebGL-контекста Skia.
createRoot(container).render(<App />);
