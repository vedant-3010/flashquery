import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import { Landing } from '@/landing/Landing'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('HushGlance: #root element missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
)
