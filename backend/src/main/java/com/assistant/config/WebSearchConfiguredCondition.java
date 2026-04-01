package com.assistant.config;

import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * Enables the web search tool bean only when a non-blank Tavily API key is configured
 * ({@code app.web-search.api-key}).
 */
public class WebSearchConfiguredCondition implements Condition {

    private static final String PROP = "app.web-search.api-key";

    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        String key = context.getEnvironment().getProperty(PROP);
        return key != null && !key.isBlank();
    }
}
