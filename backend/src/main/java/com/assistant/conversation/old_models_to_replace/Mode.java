package com.assistant.conversation.old_models_to_replace;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class Mode {

    private String id;
    private String name;
    private String systemPrompt;
    private List<String> autoIncludes = new ArrayList<>();
    private List<String> rules = new ArrayList<>();
    private String color;
    private boolean useReasoning = false;
    /** When true, mode is for guided/agent presets only — not offered in the main chat mode selector. */
    private boolean agentOnly = false;
    private String llmId;
}
