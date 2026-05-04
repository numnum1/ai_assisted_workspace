import { useState } from "react";
import type { Project } from "./project";

export function useProject (pathToOpen?: string) : Project {
    const [path, setPath] = useState(pathToOpen ?? '')

    return {
        path: path,
        openPath: setPath
    }
}