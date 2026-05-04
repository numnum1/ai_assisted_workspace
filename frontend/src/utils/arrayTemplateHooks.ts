import { useCallback, useState } from "react"

export function useAdd<T>(arraySetter: React.Dispatch<React.SetStateAction<T[]>>): (entry: T) => void {
  return useCallback((entry: T) => {
    arraySetter(prev => prev.concat(entry))
  }, [arraySetter])
}

export function useRemoveIdentical<T>(arraySetter: React.Dispatch<React.SetStateAction<T[]>>): (entry: T) => void {
  return useCallback((entry: T) => {
    arraySetter(prev => prev.filter(e => e !== entry))
  }, [arraySetter])
}

export function useRemove<T>(arraySetter: React.Dispatch<React.SetStateAction<T[]>>): (predicate: (entry: T) => boolean) => void {
  return useCallback((predicate) => {
    arraySetter(prev => prev.filter(e => !predicate(e)))
  }, [arraySetter])
}

export function useArrayState<T>(initial: T[]): [T[], (entry: T) => void, (predicate: (entry: T) => boolean) => void] {
  const [state, setState] = useState<T[]>(initial)
  const add = useAdd(setState)
  const remove = useRemove(setState)
  return [state, add, remove]
}

