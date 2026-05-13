import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

export type Setter<T> = Dispatch<SetStateAction<T>>

export type Finder<T extends IdType, K = string> = (id: K) => T | null
export type Patcher<T extends IdType, K = string> = (id: K, patch: Partial<T>) => void

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
): Finder<T, K> {
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
  setter: Setter<T[]>,
) {
  setter((prev) =>
    prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
  );
}

export function usePatchEntry<T extends IdType, K = string>(
  setter: React.Dispatch<SetStateAction<T[]>>,
): Patcher<T, K> {
  return useCallback(
    (id: K, patch: Partial<T>) => {
      patchEntry(id, patch, setter);
    },
    [setter],
  );
}

export function collectById<T extends IdType, K = string>(
  array: K[],
  findFunction: Finder<T, K>
) {
  const res: T[] = [];
  for (const modeId of array) {
    const found = findFunction(modeId);
    if (found != null) res.push(found);
  }
  return res;
}

export function useLocalStorageState(key: string, initialValue: string): [string, Setter<string>] {
  const [value, setValue] = useState(() => {
    return localStorage.getItem(key) ?? initialValue;
  });
  useEffect(() => {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }, [key, value]);

  return [value, setValue] as const;
}