package com.assistant.model.conversation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_EMPTY)
public class MultipleChoicePart extends MessagePart {

    private List<MultipleChoiceOption> options = new ArrayList<>();
    private boolean hasAlternativeSelected;
    private String alternative;

    public List<MultipleChoiceOption> getOptions() {
        return options;
    }

    public void setOptions(List<MultipleChoiceOption> options) {
        this.options = options != null ? options : new ArrayList<>();
    }

    public boolean isHasAlternativeSelected() {
        return hasAlternativeSelected;
    }

    public void setHasAlternativeSelected(boolean hasAlternativeSelected) {
        this.hasAlternativeSelected = hasAlternativeSelected;
    }

    public String getAlternative() {
        return alternative;
    }

    public void setAlternative(String alternative) {
        this.alternative = alternative;
    }
}
