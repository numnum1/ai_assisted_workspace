import type { Chat } from "../chat/Chat";
import type { Project } from "./project-types";

const testChats: Chat[] = [
  {
    parentChatId: "root",
    id: "chat-1",
    name: "Erster Test-Chat",
    conversation: {
      turns: [
        {
          type: "SYSTEM",
          text: "Willkommen zum Test-Chat!",
          timestamp: Date.now() - 10000,
        },
        {
          type: "USER",
          text: "Hallo, kannst du mir helfen?",
          timestamp: Date.now() - 5000,
        },
        {
          type: "ASSISTANT",
          usedModeName: "review",
          messages: [
            { type: "TEXT", text: "Ja, gerne! Womit kann ich dir helfen?" },
          ],
          timestamp: Date.now(),
        },
      ],
    },
    settings: {
      selectedModeId: "review",
      availableModeIds: ["review", "edit", "agent"],
      selectedLLM: { id: "gpt-4", useReasoning: false },
      availableLLMIds: ["gpt-4", "gpt-3.5"],
      availableToolsIds: ["web", "wiki"],
    },
  },
];

export const testProjectData: Project = {
  chats: testChats,
  settings: {
    llms: [
      {
        id: "gpt-4",
        name: "GPT-4",
        fast: {
          host: "https://api.openai.com",
          apiKey: "test-key",
          model: "gpt-4",
        },
        reasoning: {
          host: "https://api.openai.com",
          apiKey: "test-key",
          model: "gpt-4-turbo",
        },
      },
      {
        id: "gpt-3.5",
        name: "GPT-3.5",
        fast: {
          host: "https://api.openai.com",
          apiKey: "test-key",
          model: "gpt-3.5-turbo",
        },
        reasoning: {
          host: "https://api.openai.com",
          apiKey: "test-key",
          model: "gpt-3.5-turbo",
        },
      },
    ],
    modes: [
      {
        id: "review",
        name: "Review",
        systemPrompt: "Du bist ein hilfreicher Reviewer.",
        color: "blue",
      },
      {
        id: "edit",
        name: "Edit",
        systemPrompt: "Du bist ein hilfreicher Editor.",
        color: "red",
      },
      {
        id: "agent",
        name: "Agent",
        systemPrompt: "Du bist ein hilfreicher Agent.",
        color: "yellow",
      },
    ],
  },
};