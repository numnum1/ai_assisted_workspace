package com.assistant.service;

import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses @file and @file:startLine-endLine references in user messages
 * and resolves them to file content.
 */
@Service
public class ReferenceResolver {

    // Matches @path/to/file.md or @path/to/file.md:10-25
    private static final Pattern REF_PATTERN = Pattern.compile(
            "@([\\w./_-]+(?:\\.[\\w]+)?)(?::(\\d+)-(\\d+))?"
    );

    private final FileService fileService;

    public ReferenceResolver(FileService fileService) {
        this.fileService = fileService;
    }

    public ResolvedReferences resolve(String message, List<String> explicitFiles) {
        Set<String> allFiles = new LinkedHashSet<>();
        Map<String, String> fileContents = new LinkedHashMap<>();
        StringBuilder cleanMessage = new StringBuilder(message);

        // Resolve inline @references
        Matcher matcher = REF_PATTERN.matcher(message);
        List<InlineRef> inlineRefs = new ArrayList<>();

        while (matcher.find()) {
            String filePath = matcher.group(1);
            String startLineStr = matcher.group(2);
            String endLineStr = matcher.group(3);

            if (fileService.fileExists(filePath)) {
                inlineRefs.add(new InlineRef(
                        matcher.start(), matcher.end(),
                        filePath, startLineStr, endLineStr
                ));
                allFiles.add(filePath);
            }
        }

        // Replace references in reverse order to preserve positions
        for (int i = inlineRefs.size() - 1; i >= 0; i--) {
            InlineRef ref = inlineRefs.get(i);
            String label = ref.startLine != null
                    ? ref.filePath + ":" + ref.startLine + "-" + ref.endLine
                    : ref.filePath;
            cleanMessage.replace(ref.start, ref.end, "[" + label + "]");
        }

        // Add explicitly referenced files, expanding directories to their contained files
        if (explicitFiles != null) {
            for (String path : explicitFiles) {
                String cleanPath = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
                if (fileService.isDirectory(cleanPath)) {
                    try {
                        allFiles.addAll(fileService.listFiles(cleanPath));
                    } catch (IOException e) {
                        fileContents.put(path, "[Error listing directory: " + e.getMessage() + "]");
                    }
                } else {
                    allFiles.add(path);
                }
            }
        }

        // Load content for all referenced files
        for (String filePath : allFiles) {
            if (fileContents.containsKey(filePath)) continue;
            try {
                InlineRef ref = inlineRefs.stream()
                        .filter(r -> r.filePath.equals(filePath) && r.startLine != null)
                        .findFirst().orElse(null);

                String content;
                if (ref != null && ref.startLine != null) {
                    int start = Integer.parseInt(ref.startLine);
                    int end = Integer.parseInt(ref.endLine);
                    content = fileService.readFileLines(filePath, start, end);
                } else {
                    content = fileService.readFile(filePath);
                }
                fileContents.put(filePath, content);
            } catch (IOException e) {
                fileContents.put(filePath, "[Error reading file: " + e.getMessage() + "]");
            }
        }

        return new ResolvedReferences(cleanMessage.toString(), fileContents);
    }

    public record InlineRef(int start, int end, String filePath, String startLine, String endLine) {}

    public record ResolvedReferences(String cleanMessage, Map<String, String> fileContents) {}
}
