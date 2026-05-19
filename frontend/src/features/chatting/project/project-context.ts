import { createContext } from "react";
import type { ProjectViewModel } from "./project-types";

const defaultProjectViewModel: ProjectViewModel = {
  settings: {
    llms: [],
    modes: [],
  },
  chats: [],
  setSettings: () => {},
  setChat: () => {},
  findChatById: () => null,
  findModeById: () => null,
  findLLMById: () => null,
  setChats: () => {},
  defaultLLM: {
    id: null,
    useReasoning: false,
  },
  chatStreaming: {
    startStream: () => {},
    stopStream: () => {},
    getStream: () => undefined,
    streams: new Map(),
  },
};

const ProjectContext = createContext<ProjectViewModel>(defaultProjectViewModel);

export default ProjectContext;
