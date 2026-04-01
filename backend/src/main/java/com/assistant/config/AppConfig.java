package com.assistant.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "app")
public class AppConfig {

    private final Ai ai = new Ai();
    private final Project project = new Project();
    private final Git git = new Git();
    private final Data data = new Data();
    private final WebSearch webSearch = new WebSearch();

    public Ai getAi() {
        return ai;
    }

    public Project getProject() {
        return project;
    }

    public Git getGit() {
        return git;
    }

    public Data getData() {
        return data;
    }

    public WebSearch getWebSearch() {
        return webSearch;
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

    /**
     * Optional override for application data directory (workspace mode plugins, etc.).
     * When empty, OS default is used: %APPDATA%/markdown-project (Windows) or ~/.config/markdown-project.
     */
    public static class Data {
        private String dataDir = "";

        public String getDataDir() {
            return dataDir;
        }

        public void setDataDir(String dataDir) {
            this.dataDir = dataDir != null ? dataDir : "";
        }
    }

    /**
     * Optional Tavily search ({@code https://api.tavily.com}). Personal use: obtain a key at tavily.com.
     */
    public static class WebSearch {
        private String apiKey = "";
        /** Capped per request (Tavily and tool schema). */
        private int maxResults = 8;
        /** {@code basic} or {@code advanced} — passed through to Tavily. */
        private String searchDepth = "basic";
        /** Max characters of snippet text per result (keeps context small). */
        private int maxSnippetChars = 450;

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey != null ? apiKey : "";
        }

        public int getMaxResults() {
            return maxResults;
        }

        public void setMaxResults(int maxResults) {
            this.maxResults = maxResults;
        }

        public String getSearchDepth() {
            return searchDepth;
        }

        public void setSearchDepth(String searchDepth) {
            this.searchDepth = searchDepth != null && !searchDepth.isBlank() ? searchDepth : "basic";
        }

        public int getMaxSnippetChars() {
            return maxSnippetChars;
        }

        public void setMaxSnippetChars(int maxSnippetChars) {
            this.maxSnippetChars = Math.max(80, maxSnippetChars);
        }
    }
}
