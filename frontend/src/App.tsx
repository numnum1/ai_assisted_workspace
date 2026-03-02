import { useState, useCallback } from 'react';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { FileTree } from './components/FileTree.tsx';
import { Editor } from './components/Editor.tsx';
import { ChatPanel } from './components/ChatPanel.tsx';
import { ContextBar } from './components/ContextBar.tsx';
import { useProject } from './hooks/useProject.ts';
import { useChat } from './hooks/useChat.ts';
import { useReferencedFiles } from './hooks/useContext.ts';

function App() {
  const project = useProject();
  const chat = useChat();
  const refs = useReferencedFiles();
  const [selectedMode, setSelectedMode] = useState('review');

  const handleFileDragStart = useCallback((_path: string) => {
    // Visual feedback could be added here
  }, []);

  const handleSendMessage = useCallback(
    (message: string) => {
      chat.sendMessage(message, project.openFilePath, selectedMode, refs.referencedFiles);
    },
    [chat, project.openFilePath, selectedMode, refs.referencedFiles],
  );

  return (
    <div className="app">
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
            selectedMode={selectedMode}
            referencedFiles={refs.referencedFiles}
            onModeChange={setSelectedMode}
            onSend={handleSendMessage}
            onStop={chat.stopStreaming}
            onClear={chat.clearChat}
            onAddFile={refs.addFile}
            onRemoveFile={refs.removeFile}
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
