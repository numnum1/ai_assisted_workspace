package com.assistant.tools;

/**
 * Base class for tools that provides shared JSON argument parsing.
 * Avoids pulling in a JSON library for simple {"key": "value"} structures.
 */
public abstract class AbstractTool implements Tool {

    /**
     * Extracts a string value from a flat JSON object by key.
     * Handles basic escape sequences: \", \\, \n, \t.
     */
    protected String extractArg(String json, String key) {
        if (json == null) return null;
        String search = "\"" + key + "\"";
        int keyIdx = json.indexOf(search);
        if (keyIdx == -1) return null;
        int colonIdx = json.indexOf(':', keyIdx + search.length());
        if (colonIdx == -1) return null;
        int startQuote = json.indexOf('"', colonIdx + 1);
        if (startQuote == -1) return null;
        int endQuote = findClosingQuote(json, startQuote + 1);
        if (endQuote == -1) return null;
        return json.substring(startQuote + 1, endQuote)
                .replace("\\\"", "\"")
                .replace("\\\\", "\\")
                .replace("\\n", "\n")
                .replace("\\t", "\t");
    }

    private int findClosingQuote(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (s.charAt(i) == '\\') {
                i++;
            } else if (s.charAt(i) == '"') {
                return i;
            }
        }
        return -1;
    }
}
