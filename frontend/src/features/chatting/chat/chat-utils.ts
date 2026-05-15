import type { Chat } from "./Chat";

export function ChatLength (chat: Chat) : number {
    let res: number = 0
    chat.conversation.turns.forEach((t) => {
        if(t.type === 'SYSTEM' || t.type === 'USER') {
            res++
        } else if (t.type === 'ASSISTANT') {
            res += t.messages.length
        }
    })
    return res
}