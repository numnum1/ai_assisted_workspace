import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './builtinMediaProjects.ts'
import App from './App.tsx'
import { StoryboardWindow } from './features/storyboard/StoryboardWindow.tsx'
import { ChatWindow } from './ChatWindow.tsx'

const kind = new URLSearchParams(window.location.search).get('window')
const Root =
  kind === 'storyboard' ? StoryboardWindow : kind === 'chat' ? ChatWindow : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
