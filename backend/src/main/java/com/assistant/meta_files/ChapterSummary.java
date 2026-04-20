package com.assistant.meta_files;

import com.assistant.project_outliner.StructureNodeMeta;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChapterSummary {

    private String id;
    private StructureNodeMeta meta;
}
