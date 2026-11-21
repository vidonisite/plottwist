import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

import { updateChristmasTheme } from './christmas/christmasTheme.js'

updateChristmasTheme()

createRoot(document.getElementById('root')).render(<App />)
