import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FileViewerPage } from './components/FileViewerPage.tsx'

const isViewer = new URLSearchParams(window.location.search).get('viewer') === '1';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isViewer ? <FileViewerPage /> : <App />}
  </StrictMode>,
)
