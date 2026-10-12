import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './index.css'
import { registerServiceWorker } from './pwa/register'
import { App } from './ui/App'
import { installKeyboardFit } from './ui/viewport'
import { restoreTrainer } from './ui/trainer/trainerStore'
import { restoreStory } from './ui/story/storyStore'

restoreTrainer()
restoreStory()
installKeyboardFit()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
