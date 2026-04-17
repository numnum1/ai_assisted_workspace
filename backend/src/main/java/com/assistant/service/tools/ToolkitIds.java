package com.assistant.service.tools;

/**
 * Stable toolkit ids sent by the client in {@code ChatRequest#disabledToolkits}
 * and returned by {@link Tool#getToolkit()}.
 */
public final class ToolkitIds {

    public static final String WEB = "web";
    public static final String WIKI = "wiki";
    public static final String DATEISYSTEM = "dateisystem";
    public static final String ASSISTANT = "assistant";
    /** {@code glossary_add} and related UI toggles (separate from {@link #ASSISTANT}). */
    public static final String GLOSSARY = "glossary";

    private ToolkitIds() {}
}
