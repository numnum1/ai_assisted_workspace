package com.assistant.model;

/**
 * Summary of an available workspace mode (built-in classpath or user AppData plugin).
 *
 * @param icon      Lucide icon name for subproject folder in the file tree (e.g. book, disc).
 * @param mediaType When true, the mode can be chosen when creating a media subproject.
 */
public record WorkspaceModeInfo(String id, String name, String source, String icon, boolean mediaType) {
}
