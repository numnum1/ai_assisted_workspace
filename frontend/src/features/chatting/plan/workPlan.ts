import type { SetStateAction } from "react";
import type { BaseContextBlock } from "../context/contextBlock";

export type WorkPlan = BaseContextBlock & {
    title: string,
    rename: React.Dispatch<SetStateAction<string>>
    content: string,
    replaceContent: React.Dispatch<SetStateAction<string>>
}
