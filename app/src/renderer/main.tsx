import './styles.css'

import { createRoot } from 'react-dom/client'

import { App } from './App'
import { applyMotionLevel } from './motion'

applyMotionLevel()
createRoot(document.getElementById('root')!).render(<App />)
