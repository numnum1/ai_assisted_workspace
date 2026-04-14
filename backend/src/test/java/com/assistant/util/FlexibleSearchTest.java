package com.assistant.util;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class FlexibleSearchTest {

    @Test
    void spaceInQueryMatchesHyphenInHaystack() {
        assertTrue(FlexibleSearch.matchesFlexible("ember-kin", "Ember Kin"));
    }

    @Test
    void strictHyphenQueryStillWorks() {
        assertTrue(FlexibleSearch.matchesFlexible("wiki/ember-kin.md", "ember-kin"));
    }

    @Test
    void pathSeparatorsAlignWithSpacesInQuery() {
        assertTrue(FlexibleSearch.matchesFlexible("src/main/foo_bar", "main foo bar"));
    }

    @Test
    void noFalsePositiveWhenTokensDiffer() {
        assertFalse(FlexibleSearch.matchesFlexible("ember-kin", "ember tin"));
    }

    @Test
    void normalizeForMatchCollapsesSeparators() {
        assertTrue(FlexibleSearch.normalizeForMatch("wiki/Ember-Kin_stuff")
                .contains(FlexibleSearch.normalizeForMatch("ember kin stuff")));
    }
}
