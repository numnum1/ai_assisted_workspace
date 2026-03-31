package com.assistant.util;

import com.assistant.model.ChapterSummary;

import java.text.Collator;
import java.util.Comparator;
import java.util.Locale;

/**
 * Locale-aware title ordering with numeric segments compared by value
 * (e.g. "Kapitel 2" before "Kapitel 10").
 */
public final class NaturalTitleComparator {

    public static final Comparator<String> INSTANCE = new NaturalTitleComparatorImpl();

    private NaturalTitleComparator() {}

    public static String chapterSortKey(ChapterSummary c) {
        if (c.getMeta() != null) {
            String t = c.getMeta().getTitle();
            if (t != null && !t.isBlank()) {
                return t;
            }
        }
        return c.getId() != null ? c.getId() : "";
    }

    private static final class NaturalTitleComparatorImpl implements Comparator<String> {

        private final Collator collator = Collator.getInstance(Locale.GERMAN);

        @Override
        public int compare(String a, String b) {
            if (a == null) {
                a = "";
            }
            if (b == null) {
                b = "";
            }
            int ia = 0;
            int ib = 0;
            while (ia < a.length() && ib < b.length()) {
                char ca = a.charAt(ia);
                char cb = b.charAt(ib);
                boolean da = Character.isDigit(ca);
                boolean db = Character.isDigit(cb);
                if (da && db) {
                    int na = endDigitRun(a, ia);
                    int nb = endDigitRun(b, ib);
                    long va = Long.parseLong(a.substring(ia, na));
                    long vb = Long.parseLong(b.substring(ib, nb));
                    if (va != vb) {
                        return Long.compare(va, vb);
                    }
                    ia = na;
                    ib = nb;
                } else if (!da && !db) {
                    int na = endNonDigitRun(a, ia);
                    int nb = endNonDigitRun(b, ib);
                    int cmp = collator.compare(a.substring(ia, na), b.substring(ib, nb));
                    if (cmp != 0) {
                        return cmp;
                    }
                    ia = na;
                    ib = nb;
                } else {
                    return Boolean.compare(db, da);
                }
            }
            return Integer.compare(a.length(), b.length());
        }

        private static int endDigitRun(String s, int i) {
            int j = i;
            while (j < s.length() && Character.isDigit(s.charAt(j))) {
                j++;
            }
            return j;
        }

        private static int endNonDigitRun(String s, int i) {
            int j = i;
            while (j < s.length() && !Character.isDigit(s.charAt(j))) {
                j++;
            }
            return j;
        }
    }
}
