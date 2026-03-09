import { useState, useEffect, useCallback, useRef } from 'react';
import { typesApi, typedFilesApi } from '../api.ts';
import type { TypeDefinition } from '../types.ts';

interface UseTypedFileResult {
  typeDef: TypeDefinition | null;
  data: Record<string, unknown>;
  isDirty: boolean;
  loading: boolean;
  error: string | null;
  updateData: (data: Record<string, unknown>) => void;
  save: () => Promise<void>;
}

/**
 * Loads the type definition and data for a typed file (e.g. .scene.json, .chapter.json).
 * Returns null typeDef if the file extension is not a known type.
 */
export function useTypedFile(filePath: string | null): UseTypedFileResult {
  const [typeDef, setTypeDef] = useState<TypeDefinition | null>(null);
  const [data, setData] = useState<Record<string, unknown>>({});
  const [savedData, setSavedData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allTypes, setAllTypes] = useState<TypeDefinition[]>([]);
  const loadedPath = useRef<string | null>(null);

  // Load all type definitions once
  useEffect(() => {
    typesApi.getAll()
      .then(setAllTypes)
      .catch((err) => console.error('Failed to load type definitions', err));
  }, []);

  // Detect type and load file data when filePath changes
  useEffect(() => {
    if (!filePath || allTypes.length === 0) {
      setTypeDef(null);
      setData({});
      setSavedData({});
      return;
    }

    const filename = filePath.includes('/')
      ? filePath.substring(filePath.lastIndexOf('/') + 1)
      : filePath;

    const matchedType = allTypes.find((t) => filename.endsWith(t.fileExtension)) ?? null;
    setTypeDef(matchedType);

    if (!matchedType) {
      setData({});
      setSavedData({});
      return;
    }

    if (loadedPath.current === filePath) return;
    loadedPath.current = filePath;

    setLoading(true);
    setError(null);

    typedFilesApi.getContent(filePath)
      .then((result) => {
        const d = result.data ?? {};
        setData(d);
        setSavedData(d);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setData({});
        setSavedData({});
      })
      .finally(() => setLoading(false));
  }, [filePath, allTypes]);

  const updateData = useCallback((newData: Record<string, unknown>) => {
    setData(newData);
  }, []);

  const save = useCallback(async () => {
    if (!filePath) return;
    await typedFilesApi.saveContent(filePath, data);
    setSavedData(data);
  }, [filePath, data]);

  const isDirty = JSON.stringify(data) !== JSON.stringify(savedData);

  return { typeDef, data, isDirty, loading, error, updateData, save };
}
