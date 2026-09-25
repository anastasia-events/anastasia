import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PhoneSessionProvider } from './PhoneSession.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhoneSessionProvider>
      <App />
    </PhoneSessionProvider>
  </StrictMode>,
)
