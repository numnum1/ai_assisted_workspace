package com.assistant.util;

import java.util.Locale;

/**
 * Path and filename matching that treats spaces, hyphens, underscores, and slashes
 * as equivalent separators (after lowercasing), while preserving strict substring
 * matching when that already succeeds.
 */
public final class FlexibleSearch {

    private FlexibleSearch() {}

    /**
     * Lowercases (ROOT), maps backslashes to slashes, then collapses runs of
     * whitespace, hyphen, underscore, and slash to a single space.
     */
    public static String normalizeForMatch(String s) {
        if (s == null) {
            return "";
        }
        return s.toLowerCase(Locale.ROOT)
                .replace('\\', '/')
                .replaceAll("[\\s\\-_/]+", " ")
                .trim()
                .replaceAll(" +", " ");
    }

    /**
     * True if {@code needle} is contained in {@code haystack} case-insensitively,
     * or if the normalized forms (see {@link #normalizeForMatch}) satisfy {@code contains}.
     */
    public static boolean matchesFlexible(String haystack, String needle) {
        if (needle == null || needle.isBlank()) {
            return true;
        }
        if (haystack == null) {
            return false;
        }
        String lowerH = haystack.toLowerCase(Locale.ROOT);
        String lowerN = needle.toLowerCase(Locale.ROOT);
        if (lowerH.contains(lowerN)) {
            return true;
        }
        String normH = normalizeForMatch(haystack);
        String normN = normalizeForMatch(needle);
        return normH.contains(normN);
    }
}
