import './styles.css'

import { createRoot } from 'react-dom/client'

import { App } from './App'
import { applyMotionLevel } from './motion'
import { applySidebarWidth } from './shell/sidebarWidth'

applyMotionLevel()
applySidebarWidth()
createRoot(document.getElementById('root')!).render(<App />)
