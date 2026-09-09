import { Inbox, Loader2, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AgentId, InstallMethod, ScanResult, Scope, UpdateState, UpdateStatus } from '@shared/types'
import { Header } from './components/Header'
import { ProjectRootsDialog } from './components/ProjectRootsDialog'
import { Sidebar, type Filters } from './components/Sidebar'
import { SkillDetail, type Tab } from './components/SkillDetail'
import { SkillList } from './components/SkillList'
import { useTheme } from './hooks/useTheme'
import { api } from './lib/api'

const HIDE_BUILTIN_KEY = 'sm-hide-builtin'
const emptyFilters = (): Filters => ({
  agents: new Set(),
  scopes: new Set(),
  methods: new Set(),
  updates: new Set(),
  // Codex's bundled skills are hidden by default; the user can switch them back on (remembered).
  hideBuiltIn: localStorage.getItem(HIDE_BUILTIN_KEY) !== '0',
})

export default function App() {
  const { theme, setTheme } = useTheme()
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [scanning, setScanning] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({})
  const [checking, setChecking] = useState(false)
  const [checkingOne, setCheckingOne] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(location.search).get('skill'))
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get('tab')
    return t === 'files' || t === 'manage' ? t : 'readme'
  })
  const [rootsOpen, setRootsOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async (refresh = false) => {
    setScanning(true)
    setScanError(null)
    try {
      const r = await api.scan(refresh)
      setScan(r)
      if (refresh) setUpdates({})
    } catch (e) {
      setScanError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    localStorage.setItem(HIDE_BUILTIN_KEY, filters.hideBuiltIn ? '1' : '0')
  }, [filters.hideBuiltIn])

  const checkAll = useCallback(async () => {
    setChecking(true)
    try {
      setUpdates(await api.updates())
    } catch (e) {
      setScanError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }, [])

  const checkOne = useCallback(async (id: string) => {
    setCheckingOne(id)
    try {
      const u = await api.update(id)
      setUpdates((prev) => ({ ...prev, [id]: u }))
    } finally {
      setCheckingOne(null)
    }
  }, [])

  // Keyboard: "/" focuses search, j/k navigate, Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'Escape' && typing) {
        (e.target as HTMLElement).blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const skills = scan?.skills ?? []

  const counts = useMemo(() => {
    const agents = new Map<AgentId, number>()
    const scopes = new Map<Scope, number>()
    const methods = new Map<InstallMethod, number>()
    const ups = new Map<UpdateState, number>()
    for (const s of skills) {
      for (const a of s.agents) agents.set(a, (agents.get(a) ?? 0) + 1)
      for (const sc of s.scopes) scopes.set(sc, (scopes.get(sc) ?? 0) + 1)
      methods.set(s.install.method, (methods.get(s.install.method) ?? 0) + 1)
      const u = updates[s.id]?.state
      if (u) ups.set(u, (ups.get(u) ?? 0) + 1)
    }
    return { agents, scopes, methods, updates: ups }
  }, [skills, updates])

  const builtInCount = useMemo(() => skills.filter((s) => s.install.method === 'codex-system').length, [skills])
  const builtInHidden = filters.hideBuiltIn && !filters.methods.has('codex-system')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((s) => {
      if (builtInHidden && s.install.method === 'codex-system') return false
      if (filters.agents.size && !s.agents.some((a) => filters.agents.has(a))) return false
      if (filters.scopes.size && !s.scopes.some((a) => filters.scopes.has(a))) return false
      if (filters.methods.size && !filters.methods.has(s.install.method)) return false
      if (filters.updates.size) {
        const u = updates[s.id]?.state
        if (!u || !filters.updates.has(u)) return false
      }
      if (q) {
        const hay = `${s.name} ${s.description ?? ''} ${s.realPath} ${s.locations.map((l) => l.path).join(' ')} ${s.install.label}`.toLowerCase()
        if (!q.split(/\s+/).every((part) => hay.includes(part))) return false
      }
      return true
    })
  }, [skills, filters, query, updates, builtInHidden])

  const selected = skills.find((s) => s.id === selectedId) ?? null

  useEffect(() => {
    if (!scan) return
    if (!selected && filtered.length) setSelectedId(filtered[0].id)
  }, [scan, selected, filtered])

  useEffect(() => {
    const url = new URL(location.href)
    if (selectedId) url.searchParams.set('skill', selectedId)
    else url.searchParams.delete('skill')
    if (tab !== 'readme') url.searchParams.set('tab', tab)
    else url.searchParams.delete('tab')
    history.replaceState(null, '', url)
  }, [selectedId, tab])

  const updatesAvailable = Object.values(updates).filter((u) => u.state === 'update-available').length

  return (
    <div className="h-full flex flex-col">
      <Header
        query={query}
        setQuery={setQuery}
        onRescan={() => load(true)}
        scanning={scanning}
        onCheckUpdates={checkAll}
        checking={checking}
        theme={theme}
        setTheme={setTheme}
        total={skills.length}
        updatesAvailable={updatesAvailable}
        inputRef={searchRef}
      />
      <div className="flex-1 flex min-h-0">
        {scan && <Sidebar scan={scan} filters={filters} setFilters={setFilters} counts={counts} builtInCount={builtInCount} onManageRoots={() => setRootsOpen(true)} />}
        <main className="flex-1 flex min-w-0">
          <div className="w-[380px] shrink-0 border-r border-[var(--border)] overflow-y-auto scroll-thin bg-[var(--bg)]">
            {scanError && (
              <div className="m-3 surface p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {scanError}
              </div>
            )}
            {scan?.issues.length ? (
              <div className="m-3 surface p-3 text-xs text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/5 space-y-1">
                {scan.issues.map((i) => (
                  <div key={i} className="font-mono break-all">{i}</div>
                ))}
              </div>
            ) : null}
            {!scan && scanning && (
              <div className="p-8 text-sm text-[var(--fg-muted)] flex items-center gap-2 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning skill directories…
              </div>
            )}
            {scan && <SkillList skills={filtered} selectedId={selectedId} onSelect={setSelectedId} updates={updates} checking={checking} />}
            {scan && (
              <div className="px-4 py-3 text-[11px] text-[var(--fg-faint)] tabular-nums space-y-1">
                <div>
                  {filtered.length} of {skills.length} shown · scanned {new Date(scan.scannedAt).toLocaleTimeString()} in {scan.durationMs} ms
                </div>
                {builtInHidden && builtInCount > 0 && (
                  <div>
                    {builtInCount} Codex built-in{builtInCount === 1 ? '' : 's'} hidden ·{' '}
                    <button type="button" className="text-accent-600 dark:text-accent-300 hover:underline" onClick={() => setFilters({ ...filters, hideBuiltIn: false })}>
                      show them
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 bg-[var(--bg-elev)]">
            {selected && scan ? (
              <SkillDetail key={selected.id} skill={selected} home={scan.home} update={updates[selected.id]} checking={checking || checkingOne === selected.id} onCheck={() => checkOne(selected.id)} tab={tab} setTab={setTab} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[var(--fg-faint)] gap-3">
                <Inbox className="h-10 w-10" />
                <div className="text-sm">{scan && skills.length === 0 ? 'No skills found in any known directory.' : 'Select a skill to view it.'}</div>
              </div>
            )}
          </div>
        </main>
      </div>
      {scan && <ProjectRootsDialog open={rootsOpen} onClose={() => setRootsOpen(false)} onSaved={() => load(true)} home={scan.home} />}
    </div>
  )
}
