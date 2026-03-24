package com.assistant.model;

/**
 * Summary of an available workspace mode (built-in classpath or user AppData plugin).
 */
public record WorkspaceModeInfo(String id, String name, String source) {
}
