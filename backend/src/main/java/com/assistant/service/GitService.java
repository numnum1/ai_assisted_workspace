package com.assistant.service;

import com.assistant.config.AppConfig;
import org.eclipse.jgit.api.AddCommand;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.diff.DiffEntry;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.lib.BranchTrackingStatus;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.storage.file.FileRepositoryBuilder;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.eclipse.jgit.treewalk.AbstractTreeIterator;
import org.eclipse.jgit.treewalk.CanonicalTreeParser;
import org.eclipse.jgit.treewalk.FileTreeIterator;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class GitService {

    private final AppConfig appConfig;

    public GitService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    private Path getProjectPath() {
        return Path.of(appConfig.getProject().getPath());
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
        try (Git git = openRepo()) {
            Status status = git.status().call();

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("added", new ArrayList<>(status.getAdded()));
            result.put("modified", new ArrayList<>(status.getModified()));
            result.put("removed", new ArrayList<>(status.getRemoved()));
            result.put("untracked", new ArrayList<>(status.getUntracked()));
            result.put("changed", new ArrayList<>(status.getChanged()));
            result.put("isClean", status.isClean());
            return result;
        }
    }

    public Map<String, String> commit(String message, List<String> files) throws IOException, GitAPIException {
        try (Git git = openRepo()) {
            AddCommand add = git.add();
            if (files == null || files.isEmpty()) {
                add.addFilepattern(".");
            } else {
                for (String f : files) add.addFilepattern(f);
            }
            add.call();
            RevCommit commit = git.commit().setMessage(message).call();
            return Map.of(
                    "hash", commit.getName(),
                    "message", commit.getFullMessage()
            );
        }
    }

    public void revertFile(String path, boolean untracked) throws IOException, GitAPIException {
        try (Git git = openRepo()) {
            if (untracked) {
                Files.deleteIfExists(git.getRepository().getWorkTree().toPath().resolve(path));
            } else {
                git.checkout().addPath(path).call();
            }
        }
    }

    public String diff() throws IOException, GitAPIException {
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
            return out.toString();
        }
    }

    public List<Map<String, String>> log(int limit) throws IOException, GitAPIException {
        try (Git git = openRepo()) {
            List<Map<String, String>> commits = new ArrayList<>();
            DateTimeFormatter dtf = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
                    .withZone(ZoneId.systemDefault());

            for (RevCommit commit : git.log().setMaxCount(limit).call()) {
                Map<String, String> entry = new LinkedHashMap<>();
                entry.put("hash", commit.getName().substring(0, 8));
                entry.put("message", commit.getShortMessage());
                entry.put("author", commit.getAuthorIdent().getName());
                entry.put("date", dtf.format(Instant.ofEpochSecond(commit.getCommitTime())));
                commits.add(entry);
            }
            return commits;
        }
    }

    public void init() throws IOException, GitAPIException {
        Git.init().setDirectory(getProjectPath().toFile()).call().close();
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

    public Map<String, Integer> aheadBehind() throws IOException, GitAPIException {
        try (Git git = openRepo()) {
            String token = appConfig.getGit().getToken();
            if (token != null && !token.isBlank()) {
                git.fetch()
                        .setCredentialsProvider(new UsernamePasswordCredentialsProvider("token", token))
                        .call();
            }

            Repository repo = git.getRepository();
            String branch = repo.getBranch();
            BranchTrackingStatus trackingStatus = BranchTrackingStatus.of(repo, branch);

            if (trackingStatus == null) {
                return Map.of("ahead", 0, "behind", 0);
            }
            return Map.of("ahead", trackingStatus.getAheadCount(), "behind", trackingStatus.getBehindCount());
        }
    }

    public Map<String, String> sync() throws IOException, GitAPIException {
        try (Git git = openRepo()) {
            String token = appConfig.getGit().getToken();
            UsernamePasswordCredentialsProvider creds = (token != null && !token.isBlank())
                    ? new UsernamePasswordCredentialsProvider("token", token)
                    : null;

            Repository repo = git.getRepository();
            String branch = repo.getBranch();
            BranchTrackingStatus trackingStatus = BranchTrackingStatus.of(repo, branch);

            if (trackingStatus == null) {
                return Map.of("action", "no-remote", "details", "No tracking remote configured");
            }

            int behind = trackingStatus.getBehindCount();
            int ahead = trackingStatus.getAheadCount();

            if (behind > 0) {
                var pullCmd = git.pull();
                if (creds != null) pullCmd.setCredentialsProvider(creds);
                pullCmd.call();
                return Map.of("action", "pull", "details", "Pulled " + behind + " commit(s)");
            } else if (ahead > 0) {
                var pushCmd = git.push();
                if (creds != null) pushCmd.setCredentialsProvider(creds);
                pushCmd.call();
                return Map.of("action", "push", "details", "Pushed " + ahead + " commit(s)");
            } else {
                return Map.of("action", "up-to-date", "details", "Already up to date");
            }
        }
    }
}
