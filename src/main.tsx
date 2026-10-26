import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TranslationProvider } from './i18n/TranslationContext'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <TranslationProvider>
          <App />
      </TranslationProvider>
  </StrictMode>,
)
