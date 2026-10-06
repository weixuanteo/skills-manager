import { Loader2 } from 'lucide-react'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--fg-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Scanning skill directories…
        </div>
      }
    >
      <App />
    </Suspense>
  </React.StrictMode>,
)
