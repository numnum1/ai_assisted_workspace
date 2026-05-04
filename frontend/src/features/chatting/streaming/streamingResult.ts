export type StreamingResult = {
    type: "SUCCESS" | "ERROR",
    optionalMessage: string|null
}

export function StreamingError (error: unknown) : StreamingResult {
    if (error instanceof Error) {
        return {
            type: "ERROR",
            optionalMessage: error.message
        }
    }
    return {
        type: "ERROR",
        optionalMessage: "Unknown error"
    }
}

export function StreamingSuccess () : StreamingResult {
    return {
        type: "SUCCESS",
        optionalMessage: null
    }
}