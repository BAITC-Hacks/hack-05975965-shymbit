import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from './components/Toast'
import './styles.css'
import './status-fixes.css'
import './hub.css'
import './sana.css'
import './catalog.css'
import './themes.css'
import './motion.css'
import './theme-motion.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
