import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './apps/book/builtinMediaProjects.ts'
import App from './apps/book/App.tsx'
import { StoryboardWindow } from './apps/storyboard/StoryboardWindow.tsx'
import { ChatWindow } from './apps/chat/ChatWindow.tsx'
import { EventsWindow } from './apps/events/EventsWindow.tsx'
import { SettingsWindow } from './apps/settings/SettingsWindow.tsx'

const kind = new URLSearchParams(window.location.search).get('window')
const Root =
  kind === 'storyboard'
    ? StoryboardWindow
    : kind === 'chat'
      ? ChatWindow
      : kind === 'events'
        ? EventsWindow
        : kind === 'settings'
          ? SettingsWindow
          : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
