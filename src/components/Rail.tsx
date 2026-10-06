import { ArrowUpCircle, FolderTree, Layers, Maximize2, Minimize2, Monitor, Moon, RefreshCw, SlidersHorizontal, Sun } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'

interface Props {
  onCheckUpdates: () => void
  checking: boolean
  updatesAvailable: number
  onRescan: () => void
  scanning: boolean
  onFolders: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
  filtersActive: boolean
  focus: boolean
  onToggleFocus: () => void
  theme: Theme
  setTheme: (t: Theme) => void
}

const NEXT_THEME: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' }
const THEME_LABEL: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' }

export function Rail({ onCheckUpdates, checking, updatesAvailable, onRescan, scanning, onFolders, sidebarOpen, onToggleSidebar, filtersActive, focus, onToggleFocus, theme, setTheme }: Props) {
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  return (
    <nav className="w-11 shrink-0 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col items-center py-2 gap-1" aria-label="Main">
      <div className="h-8 w-8 mb-1 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white flex items-center justify-center shadow-sm" title="Skills Manager">
        <Layers className="h-4 w-4" />
      </div>
      <button type="button" className="rail-btn" onClick={onCheckUpdates} disabled={checking || scanning} title="Check every skill for updates">
        <ArrowUpCircle className={`h-4 w-4 ${checking ? 'animate-pulse' : ''}`} />
        {updatesAvailable > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label={`${updatesAvailable} updates available`} />}
      </button>
      <button type="button" className={`rail-btn ${sidebarOpen ? 'on' : ''}`} onClick={onToggleSidebar} aria-pressed={sidebarOpen} title={`${sidebarOpen ? 'Hide' : 'Show'} filters and scanned locations ([)`}>
        <SlidersHorizontal className="h-4 w-4" />
        {filtersActive && !sidebarOpen && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent-500" aria-label="Filters active" />}
      </button>
      <button type="button" className="rail-btn" onClick={onFolders} title="Project folders to scan">
        <FolderTree className="h-4 w-4" />
      </button>
      <span className="flex-1" />
      <button type="button" className={`rail-btn ${focus ? 'on' : ''}`} onClick={onToggleFocus} aria-pressed={focus} title={`${focus ? 'Exit' : 'Enter'} reading mode (\\)`}>
        {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button type="button" className="rail-btn" onClick={onRescan} disabled={scanning} title="Rescan skill directories">
        <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
      </button>
      <button type="button" className="rail-btn" onClick={() => setTheme(NEXT_THEME[theme])} title={`Theme: ${THEME_LABEL[theme]}. Click for ${THEME_LABEL[NEXT_THEME[theme]]}.`}>
        <ThemeIcon className="h-4 w-4" />
      </button>
    </nav>
  )
}
