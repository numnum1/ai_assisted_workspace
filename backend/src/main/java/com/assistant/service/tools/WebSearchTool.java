package com.assistant.service.tools;

import com.assistant.config.AppConfig;
import com.assistant.config.WebSearchConfiguredCondition;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Conditional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Live web search via Tavily (POST https://api.tavily.com/search). Registered only when
 * {@code app.web-search.api-key} is non-blank.
 */
@Component
@Conditional(WebSearchConfiguredCondition.class)
public class WebSearchTool extends AbstractTool {

    public static final String TOOL_NAME = "web_search";

    private static final Logger log = LoggerFactory.getLogger(WebSearchTool.class);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(45);
    private static final String TAVILY_BASE = "https://api.tavily.com";

    private final AppConfig appConfig;
    private final WebClient tavilyClient;

    public WebSearchTool(AppConfig appConfig, WebClient.Builder webClientBuilder) {
        this.appConfig = appConfig;
        this.tavilyClient = webClientBuilder.clone()
                .baseUrl(TAVILY_BASE)
                .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(4 * 1024 * 1024))
                .build();
    }

    @Override
    public String getName() {
        return TOOL_NAME;
    }

    @Override
    public String getToolkit() {
        return ToolkitIds.WEB;
    }

    @Override
    public Map<String, Object> getDefinition() {
        int cap = Math.min(15, Math.max(1, appConfig.getWebSearch().getMaxResults()));
        return Map.of(
                "type", "function",
                "function", Map.of(
                        "name", TOOL_NAME,
                        "description",
                        "Search the public web for up-to-date or factual information not present in the project "
                                + "(news, current events, documentation, general knowledge). "
                                + "Use for queries that need fresh sources. Prefer project tools (files, wiki) for story or manuscript content.",
                        "parameters", Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "query", Map.of(
                                                "type", "string",
                                                "description", "Focused search query in natural language"
                                        ),
                                        "max_results", Map.of(
                                                "type", "string",
                                                "description", "Optional max hits (default from server config, max " + cap + ")"
                                        )
                                ),
                                "required", List.of("query")
                        )
                )
        );
    }

    @Override
    public String execute(String argsJson) {
        String query = extractArg(argsJson, "query");
        if (query == null || query.isBlank()) {
            return "Error: missing or empty 'query' parameter";
        }

        int configuredMax = appConfig.getWebSearch().getMaxResults();
        int cap = Math.min(15, Math.max(1, configuredMax));
        int requested = parsePositiveInt(extractArg(argsJson, "max_results"), cap);
        int maxResults = Math.min(requested, cap);

        String depth = normalizeDepth(appConfig.getWebSearch().getSearchDepth());
        String key = appConfig.getWebSearch().getApiKey();

        log.info(
                "Received web search request: queryLen={}, maxResults={}, depth={}, query preview: {}",
                query.length(),
                maxResults,
                depth,
                previewForLog(query, 160));

        Map<String, Object> body = Map.of(
                "api_key", key,
                "query", query.trim(),
                "search_depth", depth,
                "max_results", maxResults,
                "include_answer", false
        );

        try {
            JsonNode root = tavilyClient.post()
                    .uri("/search")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .timeout(REQUEST_TIMEOUT)
                    .block();

            if (root == null) {
                log.warn("Web search finished with empty response body");
                return "Web search returned an empty response.";
            }

            JsonNode results = root.path("results");
            if (!results.isArray() || results.isEmpty()) {
                log.info("Web search finished: no results for query preview: {}", previewForLog(query, 160));
                return "No web results found for this query. Try different keywords or a shorter query.";
            }

            String formatted = formatResults(query, results, appConfig.getWebSearch().getMaxSnippetChars());
            log.info(
                    "Web search finished successfully: {} result(s), outputChars={}, query preview: {}",
                    results.size(),
                    formatted.length(),
                    previewForLog(query, 160));
            return formatted;
        } catch (WebClientResponseException e) {
            log.error(
                    "Web search API error: status={}, query preview: {}",
                    e.getStatusCode(),
                    previewForLog(query, 120),
                    e);
            return "Web search failed (HTTP " + e.getStatusCode().value() + "). Check the API key and try again.";
        } catch (Exception e) {
            log.error("Web search failed, query preview: {}", previewForLog(query, 120), e);
            return "Web search failed: " + e.getMessage();
        }
    }

    @Override
    public String describe(String argsJson) {
        String q = extractArg(argsJson, "query");
        if (q == null || q.isBlank()) {
            return "Web search";
        }
        String shortQ = q.length() > 90 ? q.substring(0, 90) + "…" : q;
        return "Web search: " + shortQ;
    }

    private static String normalizeDepth(String depth) {
        if (depth == null || depth.isBlank()) {
            return "basic";
        }
        String d = depth.trim().toLowerCase();
        return "advanced".equals(d) ? "advanced" : "basic";
    }

    private static int parsePositiveInt(String raw, int defaultValue) {
        if (raw == null || raw.isBlank()) {
            return defaultValue;
        }
        try {
            int v = Integer.parseInt(raw.trim());
            return v < 1 ? defaultValue : v;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private static String formatResults(String query, JsonNode results, int maxSnippetChars) {
        int snippetCap = Math.max(80, maxSnippetChars);
        StringBuilder sb = new StringBuilder();
        sb.append("Web search results for: ").append(query).append("\n\n");
        int n = results.size();
        for (int i = 0; i < n; i++) {
            JsonNode r = results.get(i);
            String title = r.path("title").asText("(no title)");
            String url = r.path("url").asText("");
            String content = r.path("content").asText("").replace("\r\n", "\n").trim();
            if (content.length() > snippetCap) {
                content = content.substring(0, snippetCap) + "…";
            }
            sb.append(i + 1).append(". ").append(title).append("\n");
            if (!url.isBlank()) {
                sb.append("   URL: ").append(url).append("\n");
            }
            if (!content.isBlank()) {
                sb.append("   ").append(content.replace("\n", " ")).append("\n");
            }
            sb.append("\n");
        }
        sb.append("Use these sources to answer; cite URLs when relevant.");
        return sb.toString();
    }

    private static String previewForLog(String text, int max) {
        if (text == null) {
            return "";
        }
        String t = text.replace("\r\n", " ").replace('\n', ' ');
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }
}
