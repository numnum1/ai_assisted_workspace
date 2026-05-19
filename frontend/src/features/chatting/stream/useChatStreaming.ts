import { useState } from "react";
import type { ChatStream } from "./chat-streaming-types";

export function useAddStreaming() {

    const [streams, setStreams] = useState<ChatStream[]>([]);
    console.log(streams, setStreams); // TODO: Remove

    return {
    }
}