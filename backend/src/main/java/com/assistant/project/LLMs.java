package com.assistant.project;

import com.assistant.util.Repository;

public class LLMs extends Repository<String, LLMConfig> {
    @Override protected String extractKey(LLMConfig obj) {
        return obj.getId();
    }
}
