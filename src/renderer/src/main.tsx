import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getSavedLang } from './lib/i18n'
import './styles.css'

// Synchronise la langue côté main AVANT le premier fetch des pages.
window.api.setLang(getSavedLang())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
