package com.assistant.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private final Ai ai = new Ai();
    private final Project project = new Project();
    private final Git git = new Git();

    public Ai getAi() {
        return ai;
    }

    public Project getProject() {
        return project;
    }

    public Git getGit() {
        return git;
    }

    @Bean
    public WebClient aiWebClient() {
        return WebClient.builder()
                .baseUrl(ai.getApiUrl())
                .defaultHeader("Authorization", "Bearer " + ai.getApiKey())
                .defaultHeader("Content-Type", "application/json")
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024))
                .build();
    }

    public static class Ai {
        private String apiUrl = "https://api.eecc.ai";
        private String apiKey = "";
        private String model = "gpt-5.2";

        public String getApiUrl() { return apiUrl; }
        public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
        public String getApiKey() { return apiKey; }
        public void setApiKey(String apiKey) { this.apiKey = apiKey; }
        public String getModel() { return model; }
        public void setModel(String model) { this.model = model; }
    }

    public static class Project {
        private String path = "";
        private List<String> alwaysInclude = new ArrayList<>();

        public String getPath() { return path; }
        public void setPath(String path) { this.path = path; }
        public List<String> getAlwaysInclude() { return alwaysInclude; }
        public void setAlwaysInclude(List<String> alwaysInclude) { this.alwaysInclude = alwaysInclude; }
    }

    public static class Git {
        private String token = "";
        private String username = "";

        public String getToken() { return token; }
        public void setToken(String token) { this.token = token; }
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
    }
}
