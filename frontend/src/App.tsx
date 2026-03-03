import { useState, useCallback, useEffect, useMemo } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FolderOpen } from 'lucide-react';
import { FileTree } from './components/FileTree.tsx';
import { Editor } from './components/Editor.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import type { CommandAction } from './components/CommandPalette.tsx';
import type { Mode } from './types.ts';
import { modesApi } from './api.ts';
import { useProject } from './hooks/useProject.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';

function App() {
  const project = useProject();
  const chat = useChat();
  const refs = useReferencedFiles();
  const [modes, setModes] = useState<Mode[]>([]);
  const [selectedMode, setSelectedMode] = useState('review');

  useEffect(() => {
    modesApi.getAll().then(setModes).catch(console.error);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const commandActions: CommandAction[] = useMemo(() => [
    {
      id: 'open-folder',
      label: 'Open Folder',
      shortcut: 'Ctrl+Shift+A',
      icon: <FolderOpen size={16} />,
      handler: () => {},
    },
  ], []);

  const handleFileDragStart = useCallback((_path: string) => {
    // Visual feedback could be added here
  }, []);

  const handleSendMessage = useCallback(
    (message: string) => {
      const mode = modes.find((m) => m.id === selectedMode);
      chat.sendMessage(message, null, selectedMode, refs.referencedFiles, mode?.name, mode?.color);
    },
    [chat, selectedMode, modes, refs.referencedFiles],
  );

  return (
    <div className="app">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={commandActions}
        onOpenFolder={project.openProject}
      />

      <Group direction="horizontal" className="app-panels">
        <Panel defaultSize="18%" minSize="10%" maxSize="50%">
          <FileTree
            tree={project.fileTree}
            activeFile={project.openFilePath}
            onFileClick={project.openFile}
            onFileDragStart={handleFileDragStart}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="45%" minSize="15%">
          <Editor
            content={project.fileContent}
            filePath={project.openFilePath}
            isDirty={project.isDirty}
            onChange={project.updateContent}
            onSave={project.saveFile}
          />
        </Panel>

        <Separator className="resize-handle" />

        <Panel defaultSize="37%" minSize="15%">
          <ChatPanel
            messages={chat.messages}
            streaming={chat.streaming}
            error={chat.error}
            toolActivity={chat.toolActivity}
            modes={modes}
            selectedMode={selectedMode}
            referencedFiles={refs.referencedFiles}
            onModeChange={setSelectedMode}
            onSend={handleSendMessage}
            onStop={chat.stopStreaming}
            onClear={chat.clearChat}
            onAddFile={refs.addFile}
            onRemoveFile={refs.removeFile}
            onForkFromMessage={chat.forkFromMessage}
          />
        </Panel>
      </Group>

      <ContextBar
        contextInfo={chat.contextInfo}
        activeFile={project.openFilePath}
        isDirty={project.isDirty}
      />
    </div>
  );
}

export default App;
