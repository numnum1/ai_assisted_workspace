import { registerMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';
import { MusicProjectEditor } from './media/MusicProjectEditor.tsx';

registerMediaProjectPlugin({ id: 'book', ViewComponent: DefaultMediaProjectEditor });
registerMediaProjectPlugin({ id: 'music', ViewComponent: MusicProjectEditor });
