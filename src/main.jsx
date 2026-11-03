import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/manrope'
import '@fontsource/instrument-serif/400.css'
import './styles/base.css'
import './styles/marketing.css'
import './styles/app.css'
import './styles/pages.css'
import './styles/pages2.css'
import './styles/pages3.css'
import './styles/production.css'
import App from './App'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
