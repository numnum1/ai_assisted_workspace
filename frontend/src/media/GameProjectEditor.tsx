import type { FC } from 'react';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';

/** Dedicated UI shell for the game / quest planning workspace mode. */
export const GameProjectEditor: FC<MediaProjectEditorProps> = () => (
  <div className="editor-mode-placeholder editor-empty">
    <p>Kein Editor für diesen Modus</p>
    <p className="editor-mode-placeholder-hint">Spiel-Planung — Struktur und Metadaten nutzen, oder eigenes Plugin registrieren.</p>
  </div>
);
