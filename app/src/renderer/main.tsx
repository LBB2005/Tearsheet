import './styles.css'

import { createRoot } from 'react-dom/client'

import { App } from './App'
import { startAppearance } from './appearance/store'
import { applyMotionLevel } from './motion'

applyMotionLevel()
// The look from Settings → Appearance, on the page before anything draws.
startAppearance()
createRoot(document.getElementById('root')!).render(<App />)
