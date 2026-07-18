import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './builtinMediaProjects.ts'
import App from './App.tsx'
import { StoryboardWindow } from './StoryboardWindow.tsx'

const isStoryboardWindow =
  new URLSearchParams(window.location.search).get('window') === 'storyboard'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isStoryboardWindow ? <StoryboardWindow /> : <App />}</StrictMode>,
)
