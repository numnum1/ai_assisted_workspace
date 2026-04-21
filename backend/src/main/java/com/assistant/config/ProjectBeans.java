package com.assistant.config;

import com.assistant.project.LLMs;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class ProjectBeans {

    @Bean
    public LLMs llms() {
        return new LLMs();
    }

}
