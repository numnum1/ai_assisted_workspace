import { registerMediaProjectPlugin } from './mediaProjectRegistry.ts';
import { DefaultMediaProjectEditor } from './media/DefaultMediaProjectEditor.tsx';

registerMediaProjectPlugin({ id: 'book', ViewComponent: DefaultMediaProjectEditor });
registerMediaProjectPlugin({ id: 'music', ViewComponent: DefaultMediaProjectEditor });
