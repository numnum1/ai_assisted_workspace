package com.assistant.git;

import com.assistant.config.AppConfig;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.diff.DiffEntry;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.lib.BranchTrackingStatus;
import org.eclipse.jgit.lib.Constants;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.ObjectReader;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevTree;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.storage.file.FileRepositoryBuilder;
import org.eclipse.jgit.transport.PushResult;
import org.eclipse.jgit.transport.RemoteRefUpdate;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.eclipse.jgit.treewalk.AbstractTreeIterator;
import org.eclipse.jgit.treewalk.CanonicalTreeParser;
import org.eclipse.jgit.treewalk.FileTreeIterator;
import org.eclipse.jgit.treewalk.TreeWalk;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class GitService {

    private static final Logger log = LoggerFactory.getLogger(GitService.class);

    private final AppConfig appConfig;

    public GitService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    private Path getProjectPath() {
        return Path.of(appConfig.getProject().getPath());
    }

    /**
     * Returns the path prefix from the git work tree root to the opened project folder,
     * using forward slashes and a trailing slash (e.g. "docs/" or "").
     * When the project IS the git root the prefix is an empty string.
     */
    private String computePrefix(Repository repo) {
        Path workTree = repo.getWorkTree().toPath().toAbsolutePath().normalize();
        Path project = getProjectPath().toAbsolutePath().normalize();
        if (workTree.equals(project)) return "";
        try {
            String rel = workTree.relativize(project).toString().replace("\\", "/");
            return rel.isEmpty() ? "" : rel + "/";
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private List<String> filterAndStrip(Collection<String> paths, String prefix) {
        if (prefix.isEmpty()) return new ArrayList<>(paths);
        List<String> result = new ArrayList<>();
        for (String p : paths) {
            if (p.startsWith(prefix)) result.add(p.substring(prefix.length()));
        }
        return result;
    }

    private Git openRepo() throws IOException {
        Repository repository = new FileRepositoryBuilder()
                .readEnvironment()
                .findGitDir(getProjectPath().toFile())
                .setMustExist(true)
                .build();
        return new Git(repository);
    }

    public Map<String, Object> status() throws IOException, GitAPIException {
        log.trace("Received request to get git status");
        try (Git git = openRepo()) {
            Status status = git.status().call();
            String prefix = computePrefix(git.getRepository());

            List<String> added     = filterAndStrip(status.getAdded(),     prefix);
            List<String> modified  = filterAndStrip(status.getModified(),  prefix);
            List<String> removed   = filterAndStrip(status.getRemoved(),   prefix);
            List<String> untracked = filterAndStrip(status.getUntracked(), prefix);
            List<String> changed   = filterAndStrip(status.getChanged(),   prefix);
            List<String> missing   = filterAndStrip(status.getMissing(),   prefix);

            boolean isClean = added.isEmpty() && modified.isEmpty() && removed.isEmpty()
                    && untracked.isEmpty() && changed.isEmpty() && missing.isEmpty();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("added",     added);
            result.put("modified",  modified);
            result.put("removed",   removed);
            result.put("untracked", untracked);
            result.put("changed",   changed);
            result.put("missing",   missing);
            result.put("isClean",   isClean);

            log.trace("Finished git status: clean={}, modified={}, untracked={}", isClean, modified.size(), untracked.size());
            return result;
        }
    }

    public Map<String, String> commit(String message, List<String> files) throws IOException, GitAPIException {
        log.trace("Received request to commit with message: {}", message);
        try (Git git = openRepo()) {
            String prefix = computePrefix(git.getRepository());
            var add = git.add();

            if (files == null || files.isEmpty()) {
                // Stage all changed and untracked files explicitly to ensure hidden files (.xyz) are included.
                // Using addFilepattern(".") in JGit can silently skip paths starting with a dot.
                Status s = git.status().call();
                Set<String> toStage = new LinkedHashSet<>();
                toStage.addAll(s.getModified());
                toStage.addAll(s.getMissing());
                toStage.addAll(s.getUntracked());
                toStage.addAll(s.getConflicting());
                toStage.addAll(s.getChanged());
                toStage.addAll(s.getAdded());
                if (toStage.isEmpty()) {
                    log.trace("Nothing to stage, using fallback pattern");
                    add.addFilepattern(prefix.isEmpty() ? "." : prefix.substring(0, prefix.length() - 1));
                } else {
                    for (String f : toStage) {
                        String pattern = prefix.isEmpty() ? f : f;
                        add.addFilepattern(pattern);
                    }
                }
            } else {
                for (String f : files) add.addFilepattern(prefix + f);
            }

            add.call();
            RevCommit commit = git.commit().setMessage(message).call();
            Map<String, String> result = Map.of(
                    "hash", commit.getName(),
                    "message", commit.getFullMessage()
            );
            log.trace("Finished commit: hash={}", commit.getName());
            return result;
        }
    }

    public void revertFile(String path, boolean untracked) throws IOException, GitAPIException {
        log.trace("Received request to revert file: {}, untracked={}", path, untracked);
        try (Git git = openRepo()) {
            String prefix = computePrefix(git.getRepository());
            String fullPath = prefix + path;
            if (untracked) {
                Files.deleteIfExists(git.getRepository().getWorkTree().toPath().resolve(fullPath));
            } else {
                // Unstage first (in case the file is in the index as added/changed), then discard working tree changes.
                git.reset().addPath(fullPath).setRef(Constants.HEAD).call();
                git.checkout().addPath(fullPath).call();
            }
        }
        log.trace("Finished reverting file: {}", path);
    }

    /**
     * Reverts all git changes (tracked and untracked) under a project-relative directory.
     *
     * @param dirPath project-relative folder path (e.g. "notes/sub" or "." for whole project scope)
     */
    public void revertDirectory(String dirPath) throws IOException, GitAPIException {
        log.trace("Received request to revert directory: {}", dirPath);
        try (Git git = openRepo()) {
            Repository repo = git.getRepository();
            String prefix = computePrefix(repo);
            String normalizedDir = normalizeProjectDirPath(dirPath);
            String repoBase = repoBasePathForRevertScope(prefix, normalizedDir);

            Status s = git.status().call();
            Path workTree = repo.getWorkTree().toPath();

            Set<String> tracked = new LinkedHashSet<>();
            for (String p : s.getModified()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }
            for (String p : s.getChanged()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }
            for (String p : s.getAdded()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }
            for (String p : s.getMissing()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }
            for (String p : s.getRemoved()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }
            for (String p : s.getConflicting()) {
                if (pathUnderRepoBase(p, repoBase)) tracked.add(p);
            }

            Set<String> untracked = new LinkedHashSet<>();
            for (String p : s.getUntracked()) {
                if (pathUnderRepoBase(p, repoBase)) untracked.add(p);
            }

            if (!tracked.isEmpty()) {
                var reset = git.reset().setRef(Constants.HEAD);
                for (String p : tracked) {
                    reset.addPath(p);
                }
                reset.call();
                var checkout = git.checkout();
                for (String p : tracked) {
                    checkout.addPath(p);
                }
                checkout.call();
            }

            if (!untracked.isEmpty()) {
                List<String> untrackedSorted = new ArrayList<>(untracked);
                untrackedSorted.sort((a, b) -> Integer.compare(b.length(), a.length()));
                for (String fullPath : untrackedSorted) {
                    Path abs = workTree.resolve(fullPath).normalize();
                    if (!abs.startsWith(workTree.normalize())) {
                        log.warn("Skipping untracked path outside work tree: {}", fullPath);
                        continue;
                    }
                    if (Files.exists(abs)) {
                        deletePathRecursive(abs);
                    }
                }
            }

            log.trace("Finished reverting directory: {}, tracked={}, untracked={}", dirPath, tracked.size(), untracked.size());
        }
    }

    private static String normalizeProjectDirPath(String dirPath) {
        if (dirPath == null || dirPath.isBlank()) {
            return ".";
        }
        String n = dirPath.replace('\\', '/').replaceAll("/+$", "");
        return n.isEmpty() ? "." : n;
    }

    /**
     * Work-tree path prefix for "everything under this project folder" (no trailing slash), or "" for whole repo when project is root.
     */
    private static String repoBasePathForRevertScope(String prefix, String normalizedProjectDir) {
        String pfx = prefix.isEmpty() ? "" : prefix.substring(0, prefix.length() - 1);
        if (".".equals(normalizedProjectDir)) {
            return pfx;
        }
        return pfx.isEmpty() ? normalizedProjectDir : pfx + "/" + normalizedProjectDir;
    }

    private static boolean pathUnderRepoBase(String repoPath, String repoBase) {
        if (repoBase.isEmpty()) {
            return true;
        }
        return repoPath.equals(repoBase) || repoPath.startsWith(repoBase + "/");
    }

    private static void deletePathRecursive(Path abs) throws IOException {
        if (!Files.exists(abs)) {
            return;
        }
        if (Files.isRegularFile(abs)) {
            Files.deleteIfExists(abs);
            return;
        }
        try (Stream<Path> walk = Files.walk(abs)) {
            List<Path> paths = walk.sorted(Comparator.reverseOrder()).toList();
            for (Path p : paths) {
                Files.deleteIfExists(p);
            }
        }
    }

    public String diff() throws IOException, GitAPIException {
        log.trace("Received request to get git diff");
        try (Git git = openRepo()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (DiffFormatter formatter = new DiffFormatter(out)) {
                formatter.setRepository(git.getRepository());

                AbstractTreeIterator oldTree;
                ObjectId head = git.getRepository().resolve("HEAD^{tree}");
                if (head != null) {
                    CanonicalTreeParser parser = new CanonicalTreeParser();
                    parser.reset(git.getRepository().newObjectReader(), head);
                    oldTree = parser;
                } else {
                    oldTree = new CanonicalTreeParser();
                }

                FileTreeIterator newTree = new FileTreeIterator(git.getRepository());
                List<DiffEntry> diffs = formatter.scan(oldTree, newTree);
                for (DiffEntry entry : diffs) {
                    formatter.format(entry);
                }
            }
            String result = out.toString(StandardCharsets.UTF_8);
            log.trace("Finished git diff: {} bytes", result.length());
            return result;
        }
    }

    public List<Map<String, String>> getFileHistory(String path) throws IOException, GitAPIException {
        log.trace("Received request to get file history for: {}", path);
        try (Git git = openRepo()) {
            String fullPath = computePrefix(git.getRepository()) + path.replace("\\", "/");
            List<Map<String, String>> commits = new ArrayList<>();
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    .withZone(ZoneId.systemDefault());
            ObjectId head = git.getRepository().resolve(Constants.HEAD);
            for (RevCommit c : git.log().add(head).addPath(fullPath).call()) {
                Map<String, String> entry = new LinkedHashMap<>();
                entry.put("hash",    c.getName());
                entry.put("message", c.getShortMessage());
                entry.put("author",  c.getAuthorIdent().getName());
                entry.put("date",    dtf.format(Instant.ofEpochSecond(c.getCommitTime())));
                commits.add(entry);
            }
            log.trace("Finished file history for {}: {} commits", path, commits.size());
            return commits;
        }
    }

    public Map<String, Object> getFileAtCommit(String path, String hash) throws IOException {
        log.trace("Received request to get file at commit: path={}, hash={}", path, hash);
        try (Git git = openRepo()) {
            Repository repo = git.getRepository();
            String fullPath = computePrefix(repo) + path.replace("\\", "/");
            ObjectId commitId = repo.resolve(hash);
            try (ObjectReader reader = repo.newObjectReader(); RevWalk rw = new RevWalk(reader)) {
                RevTree tree = rw.parseCommit(commitId).getTree();
                TreeWalk tw = TreeWalk.forPath(reader, fullPath, tree);
                if (tw == null) {
                    log.trace("Finished getFileAtCommit: file not found at commit {}", hash);
                    return Map.of("path", path, "hash", hash, "content", "", "exists", false);
                }
                String content = new String(reader.open(tw.getObjectId(0)).getBytes(), StandardCharsets.UTF_8);
                tw.close();
                log.trace("Finished getFileAtCommit: path={}, hash={}", path, hash);
                return Map.of("path", path, "hash", hash, "content", content, "exists", true);
            }
        }
    }

    public List<Map<String, String>> log(int limit) throws IOException, GitAPIException {
        log.trace("Received request to get git log, limit={}", limit);
        try (Git git = openRepo()) {
            List<Map<String, String>> commits = new ArrayList<>();
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    .withZone(ZoneId.systemDefault());

            for (RevCommit commit : git.log().setMaxCount(limit).call()) {
                Map<String, String> entry = new LinkedHashMap<>();
                entry.put("hash",    commit.getName());
                entry.put("message", commit.getShortMessage());
                entry.put("author",  commit.getAuthorIdent().getName());
                entry.put("date",    dtf.format(Instant.ofEpochSecond(commit.getCommitTime())));
                commits.add(entry);
            }
            log.trace("Finished git log: {} commits returned", commits.size());
            return commits;
        }
    }

    public void init() throws IOException, GitAPIException {
        log.trace("Received request to init git repository at: {}", getProjectPath());
        Git.init().setDirectory(getProjectPath().toFile()).call().close();
        log.trace("Finished git init at: {}", getProjectPath());
    }

    public boolean isRepo() {
        try {
            new FileRepositoryBuilder()
                    .findGitDir(getProjectPath().toFile())
                    .setMustExist(true)
                    .build()
                    .close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private UsernamePasswordCredentialsProvider buildCreds() {
        String token = appConfig.getGit().getToken();
        if (token == null || token.isBlank()) return null;
        String username = appConfig.getGit().getUsername();
        String effectiveUser = (username != null && !username.isBlank()) ? username : "token";
        return new UsernamePasswordCredentialsProvider(effectiveUser, token);
    }

    public Map<String, Integer> aheadBehind() throws IOException, GitAPIException {
        log.trace("Received request to get ahead/behind status");
        try (Git git = openRepo()) {
            UsernamePasswordCredentialsProvider creds = buildCreds();
            if (creds != null) {
                git.fetch()
                        .setCredentialsProvider(creds)
                        .call();
            }

            Repository repo = git.getRepository();
            String branch = repo.getBranch();
            BranchTrackingStatus trackingStatus = BranchTrackingStatus.of(repo, branch);

            if (trackingStatus == null) {
                log.trace("Finished ahead/behind: no tracking branch");
                return Map.of("ahead", 0, "behind", 0);
            }
            Map<String, Integer> result = Map.of(
                    "ahead",  trackingStatus.getAheadCount(),
                    "behind", trackingStatus.getBehindCount()
            );
            log.trace("Finished ahead/behind: ahead={}, behind={}", result.get("ahead"), result.get("behind"));
            return result;
        }
    }

    public Map<String, String> sync() throws IOException, GitAPIException {
        log.trace("Received request to sync (pull/push)");
        try (Git git = openRepo()) {
            UsernamePasswordCredentialsProvider creds = buildCreds();

            Repository repo = git.getRepository();
            String branch = repo.getBranch();
            BranchTrackingStatus trackingStatus = BranchTrackingStatus.of(repo, branch);

            if (trackingStatus == null) {
                log.trace("Finished sync: no remote configured");
                return Map.of("action", "no-remote", "details", "No tracking remote configured");
            }

            int behind = trackingStatus.getBehindCount();
            int ahead  = trackingStatus.getAheadCount();

            if (behind > 0 && ahead > 0) {
                throw new IllegalStateException(
                        "Branch is diverged (ahead=" + ahead + ", behind=" + behind + "). Manual merge required.");
            }

            if (behind > 0) {
                var pullCmd = git.pull();
                if (creds != null) pullCmd.setCredentialsProvider(creds);
                pullCmd.call();
                log.trace("Finished sync: pulled {} commit(s)", behind);
                return Map.of("action", "pull", "details", "Pulled " + behind + " commit(s)");
            } else if (ahead > 0) {
                var pushCmd = git.push();
                if (creds != null) pushCmd.setCredentialsProvider(creds);
                Iterable<PushResult> pushResults = pushCmd.call();
                for (PushResult pr : pushResults) {
                    for (RemoteRefUpdate rru : pr.getRemoteUpdates()) {
                        if (rru.getStatus() != RemoteRefUpdate.Status.OK
                                && rru.getStatus() != RemoteRefUpdate.Status.UP_TO_DATE) {
                            throw new IOException("Push rejected: " + rru.getStatus()
                                    + (rru.getMessage() != null ? " — " + rru.getMessage() : ""));
                        }
                    }
                }
                log.trace("Finished sync: pushed {} commit(s)", ahead);
                return Map.of("action", "push", "details", "Pushed " + ahead + " commit(s)");
            } else {
                log.trace("Finished sync: already up to date");
                return Map.of("action", "up-to-date", "details", "Already up to date");
            }
        }
    }
}
