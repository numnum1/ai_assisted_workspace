import { useState, useCallback, type ReactElement } from 'react';
import { TextPromptDialog } from '../components/shared/TextPromptDialog.tsx';

interface PromptState {
  title: string;
  defaultValue: string;
  resolve: (value: string | null) => void;
}

/**
 * Returns a `prompt` function that opens an in-app modal (Electron-safe replacement for
 * `window.prompt()`) and a `dialog` element that must be rendered in the component's JSX.
 *
 * Usage:
 *   const [dialog, prompt] = useTextPrompt();
 *   // in JSX: {dialog}
 *   // in handler: const name = await prompt('Dateiname:', 'unbenannt.md');
 */
export function useTextPrompt(): [ReactElement | null, (title: string, defaultValue?: string) => Promise<string | null>] {
  const [state, setState] = useState<PromptState | null>(null);

  const prompt = useCallback((title: string, defaultValue = ''): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      setState({ title, defaultValue, resolve });
    });
  }, []);

  const handleConfirm = useCallback((value: string) => {
    const resolve = state?.resolve;
    setState(null);
    resolve?.(value);
  }, [state]);

  const handleCancel = useCallback(() => {
    const resolve = state?.resolve;
    setState(null);
    resolve?.(null);
  }, [state]);

  const dialog = state ? (
    <TextPromptDialog
      key={state.title + state.defaultValue}
      title={state.title}
      defaultValue={state.defaultValue}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return [dialog, prompt];
}
