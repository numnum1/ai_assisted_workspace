import { useCallback } from "react"

export function makeAdd<T> (array : T[] ,arraySetter: React.Dispatch<React.SetStateAction<T[]>>) : (entry: T) => T {
    const add = useCallback((entry: T) => {
        arraySetter(array.concat([entry]))
        return entry
    }, [array])
    return add
}

export function makeRemove<T> (array : T[] ,arraySetter: React.Dispatch<React.SetStateAction<T[]>>) : (entry: T) => T {
    const remove = useCallback((entry: T) => {
        arraySetter(array.filter((t) => {
            return t != entry
        }))
        return entry
    }, [array])
    return remove
}



