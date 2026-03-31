package com.assistant.model;

public class Note {

    private String id;
    private String title;
    private String content;
    private String wikiHint;
    private long createdAt;

    public Note() {}

    public Note(String id, String title, String content, String wikiHint, long createdAt) {
        this.id = id;
        this.title = title;
        this.content = content;
        this.wikiHint = wikiHint;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }

    public String getWikiHint() { return wikiHint; }
    public void setWikiHint(String wikiHint) { this.wikiHint = wikiHint; }

    public long getCreatedAt() { return createdAt; }
    public void setCreatedAt(long createdAt) { this.createdAt = createdAt; }
}
