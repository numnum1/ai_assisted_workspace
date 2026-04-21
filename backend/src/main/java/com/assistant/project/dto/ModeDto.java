package com.assistant.project.dto;

@Deprecated
public record ModeDto(String id,
                      String name,
                      String systemPrompt,
                      String[] autoIncludes,
                      String color,
                      boolean useReasoning,
                      boolean agentOnly,
                      String llmId) {
}
