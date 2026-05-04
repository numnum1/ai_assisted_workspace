import { useChatSettings } from "../chat_settings/useChatSettings";
import type { Chat } from "./chat";
import { useConversation } from "../conversation/useConversation";
import { useCallback, useMemo, useState } from "react";
import { StreamingError, StreamingSuccess, type StreamingResult } from '../streaming/streamingResult';

export function useChat () : Chat {
    
    // UI Settings
    const settings = useChatSettings()
    const conversation = useConversation()
    const [userText, setUserText] = useState("")
    const [name, setName] = useState("")
    
    // Streaming state
    const [isStreaming, setIsStreaming] = useState(false)
    const [streamingResult, setStreamingResult] = useState<StreamingResult|null>(null)

    // Enable send button
    const canSend = useMemo(() => {
        return userText.length > 0 && !isStreaming && settings.isValid && conversation.isAssistantsTurn
    }, [userText, isStreaming, settings.isValid, conversation])
    // When send button is clicked
    const send = useCallback(() => {
        if (!canSend) return
        setIsStreaming(true)
        setStreamingResult(null)
        try {
            setStreamingResult(sendConversationToLLM())
        } catch (e: unknown) {
            console.log(e)
            setStreamingResult(StreamingError(e))
        } finally {
            setIsStreaming(false)
        }
        setIsStreaming(false)
    }, [canSend, setIsStreaming])

    function sendConversationToLLM () : StreamingResult {
        // TODO: Implement
        return StreamingSuccess()
    }

    const interrupt = useCallback(() => {
        // TODO: Implement
    }, [])

    return {
        settings: settings, 
        conversation: conversation,
        userText: userText,
        setUserText: setUserText,
        name: name,
        rename: setName,
        isStreaming: isStreaming,
        send: send,
        canSend: canSend,
        interrupt: interrupt,
        streamingResult: streamingResult
    }
}