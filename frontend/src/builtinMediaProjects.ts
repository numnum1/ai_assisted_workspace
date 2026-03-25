import { registerMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';
import { GameProjectEditor } from './media/GameProjectEditor.tsx';
import { MusicProjectEditor } from './media/MusicProjectEditor.tsx';

registerMediaProjectPlugin({ id: 'book', ViewComponent: DefaultMediaProjectEditor });
registerMediaProjectPlugin({ id: 'game', ViewComponent: GameProjectEditor });
registerMediaProjectPlugin({ id: 'music', ViewComponent: MusicProjectEditor });
