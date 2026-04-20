package com.assistant.config;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.util.ArrayList;
import java.util.List;

@Configuration
@ConfigurationProperties(prefix = "app")
@Getter
public class AppConfig {

    private final Ai ai = new Ai();
    private final Project project = new Project();
    private final Git git = new Git();
    private final Data data = new Data();
    private final WebSearch webSearch = new WebSearch();

    @lombok.Data
    public static class Ai {
        private String apiUrl = "https://api.eecc.ai";
        private String apiKey = "";
        private String model = "gpt-5.2";
    }

    @Getter
    @Setter
    public static class Project {
        private String path = "";
        private List<String> alwaysInclude = new ArrayList<>();
    }

    @Getter
    @Setter
    public static class Git {
        private String token = "";
        private String username = "";
    }

    /**
     * Optional override for application data directory (workspace mode plugins, etc.).
     * When empty, OS default is used: %APPDATA%/markdown-project (Windows) or ~/.config/markdown-project.
     */
    @Getter
    public static class Data {
        @Setter(AccessLevel.NONE)
        private String dataDir = "";

        public void setDataDir(String dataDir) {
            this.dataDir = dataDir != null ? dataDir : "";
        }
    }

    /**
     * Optional Tavily search ({@code https://api.tavily.com}). Personal use: obtain a key at tavily.com.
     */
    @Getter
    public static class WebSearch {
        @Setter(AccessLevel.NONE)
        private String apiKey = "";
        /** Capped per request (Tavily and tool schema). */
        @Setter
        private int maxResults = 8;
        /** {@code basic} or {@code advanced} — passed through to Tavily. */
        @Setter(AccessLevel.NONE)
        private String searchDepth = "basic";
        /** Max characters of snippet text per result (keeps context small). */
        @Setter(AccessLevel.NONE)
        private int maxSnippetChars = 450;

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey != null ? apiKey : "";
        }

        public void setSearchDepth(String searchDepth) {
            this.searchDepth = searchDepth != null && !searchDepth.isBlank() ? searchDepth : "basic";
        }

        public void setMaxSnippetChars(int maxSnippetChars) {
            this.maxSnippetChars = Math.max(80, maxSnippetChars);
        }
    }
}
