import type { FC } from 'react';
import type { MediaProjectEditorProps } from '../mediaProjectRegistry.ts';

/** Dedicated UI shell for the music / album workspace mode. */
export const MusicProjectEditor: FC<MediaProjectEditorProps> = () => (
  <div className="editor-mode-placeholder editor-empty">
    <p>Kein Editor für diesen Modus</p>
    <p className="editor-mode-placeholder-hint">Musik — Struktur und Metadaten nutzen, oder eigenes Plugin registrieren.</p>
  </div>
);
