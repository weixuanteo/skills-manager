import { Layers, Monitor, Moon, PanelLeft, RefreshCw, Search, Sun, X, ArrowUpCircle } from 'lucide-react'
import type { Theme } from '../hooks/useTheme'

interface Props {
  query: string
  setQuery: (q: string) => void
  onRescan: () => void
  scanning: boolean
  onCheckUpdates: () => void
  checking: boolean
  theme: Theme
  setTheme: (t: Theme) => void
  total: number
  updatesAvailable: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onSearchFocus?: () => void
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function Header({ query, setQuery, onRescan, scanning, onCheckUpdates, checking, theme, setTheme, total, updatesAvailable, inputRef, onSearchFocus, sidebarOpen, onToggleSidebar }: Props) {
  const themes: { id: Theme; icon: React.ReactNode; label: string }[] = [
    { id: 'light', icon: <Sun className="h-4 w-4" />, label: 'Light' },
    { id: 'system', icon: <Monitor className="h-4 w-4" />, label: 'System' },
    { id: 'dark', icon: <Moon className="h-4 w-4" />, label: 'Dark' },
  ]
  return (
    <header className="h-14 shrink-0 border-b border-[var(--border)] bg-[var(--bg-elev)]/80 backdrop-blur flex items-center gap-3 px-3 sm:px-4">
      <div className="flex items-center gap-2 lg:w-56 shrink-0">
        <button
          type="button"
          className={`btn btn-ghost btn-icon ${sidebarOpen ? 'text-[var(--fg)]' : 'text-[var(--fg-faint)]'}`}
          onClick={onToggleSidebar}
          aria-pressed={sidebarOpen}
          title={`${sidebarOpen ? 'Hide' : 'Show'} filters ([)`}
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent-500 to-accent-700 text-white flex items-center justify-center shadow-sm">
          <Layers className="h-4.5 w-4.5" />
        </div>
        <div className="leading-tight hidden lg:block">
          <div className="font-semibold text-sm tracking-tight">Skills Manager</div>
          <div className="text-[11px] text-[var(--fg-faint)] tabular-nums">
            {total} skill{total === 1 ? '' : 's'}
            {updatesAvailable > 0 && <span className="text-amber-600 dark:text-amber-400"> · {updatesAvailable} update{updatesAvailable === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <label className="relative w-full max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--fg-faint)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={onSearchFocus}
            placeholder="Search skills by name, description, path…"
            className="w-full h-9 pl-9 pr-16 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm placeholder:text-[var(--fg-faint)] focus:border-accent-500/60 transition-colors"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost h-6 w-6 px-0 justify-center" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 kbd">/</span>
          )}
        </label>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button type="button" className="btn" onClick={onCheckUpdates} disabled={checking || scanning} title="Check every skill for updates">
          <ArrowUpCircle className={`h-4 w-4 ${checking ? 'animate-pulse' : ''}`} />
          <span className="hidden xl:inline">{checking ? 'Checking…' : 'Check updates'}</span>
        </button>
        <button type="button" className="btn" onClick={onRescan} disabled={scanning} title="Rescan skill directories">
          <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          <span className="hidden xl:inline">Rescan</span>
        </button>
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5 ml-1" role="radiogroup" aria-label="Theme">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={theme === t.id}
              title={t.label}
              onClick={() => setTheme(t.id)}
              className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${theme === t.id ? 'bg-[var(--bg-elev)] shadow-sm text-[var(--fg)] border border-[var(--border)]' : 'text-[var(--fg-faint)] hover:text-[var(--fg)]'}`}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
