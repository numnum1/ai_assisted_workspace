import { useContext, useMemo } from "react";
import type { ChatContext } from "./chat-view-model";
import ProjectContext from "../project/project-context";
import type { ChatSettings } from './unsortedChatTypes';

/**
 * Just to extract code into a smaller file
 */
export function useChatContext(chatSettings: ChatSettings): ChatContext {

  const { findLLMById } = useContext(ProjectContext);

  const systemPrompt = useMemo(() => {
    return "You are a helpful assistant that helps answer questions.";
  }, []);

  const includedFiles = useMemo(() => {
    return [];
  }, []);

  const estimatedTokens = useMemo(() => {
    return 23420;
  }, []);

  const maxTokens = useMemo(() => {
    if (!chatSettings.selectedLLM.id) return null
    const llm = findLLMById(chatSettings.selectedLLM.id!)
    if (!llm) {
      console.log('No llm selected')
      return null
    }
    return chatSettings.selectedLLM.useReasoning ? llm?.reasoning.maxTokens : llm?.fast.maxTokens;
  }, [findLLMById, chatSettings.selectedLLM]);

  const percent = useMemo(() => {
    return maxTokens ? Math.round((estimatedTokens / maxTokens) * 100) : null;
  }, [estimatedTokens, maxTokens]);

  return {
    estimatedTokens: estimatedTokens,
    maxTokens: maxTokens,
    percent: percent,
    includedFiles: includedFiles,
    systemPrompt: systemPrompt,
  };
}
