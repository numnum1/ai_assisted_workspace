package com.assistant.model;

public class GlossaryGenerateResult {

    private String term;
    private String definition;

    public GlossaryGenerateResult() {}

    public GlossaryGenerateResult(String term, String definition) {
        this.term = term;
        this.definition = definition;
    }

    public String getTerm() {
        return term;
    }

    public void setTerm(String term) {
        this.term = term;
    }

    public String getDefinition() {
        return definition;
    }

    public void setDefinition(String definition) {
        this.definition = definition;
    }
}
