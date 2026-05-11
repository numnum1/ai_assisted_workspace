import { useCallback, type SetStateAction } from "react";

export type IdType<K = string> = {
  id: K;
};

export function findById<T extends IdType, K = string>(
  id: K,
  array: T[],
): T | null {
  for (const entry of array) {
    if (entry.id === id) return entry;
  }
  return null;
}

export function useFindById<T extends IdType, K = string>(
  array: T[],
): (id: K) => T | null {
  return useCallback(
    (id: K) => {
      return findById(id, array);
    },
    [array],
  );
}

export function patchEntry<T extends IdType, K = string>(
  id: K,
  patch: Partial<T>,
  setter: React.Dispatch<SetStateAction<T[]>>,
) {
  setter((prev) =>
    prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  );
}

export function usePatchEntry<T extends IdType, K = string>(setter: React.Dispatch<SetStateAction<T[]>>) {
    return useCallback((id: K, patch: Partial<T>) => {
        patchEntry(id, patch, setter)
  }, [setter]);
}