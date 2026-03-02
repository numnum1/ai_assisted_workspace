import { useState, useCallback } from 'react';

export function useReferencedFiles() {
  const [referencedFiles, setReferencedFiles] = useState<string[]>([]);

  const addFile = useCallback((path: string) => {
    setReferencedFiles((prev) =>
      prev.includes(path) ? prev : [...prev, path],
    );
  }, []);

  const removeFile = useCallback((path: string) => {
    setReferencedFiles((prev) => prev.filter((f) => f !== path));
  }, []);

  const clearFiles = useCallback(() => {
    setReferencedFiles([]);
  }, []);

  return { referencedFiles, addFile, removeFile, clearFiles };
}
