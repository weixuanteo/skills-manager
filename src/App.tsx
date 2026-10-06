import { Inbox, PanelLeftOpen, Search, TriangleAlert, X } from 'lucide-react'
import { use, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import type { AgentId, InstallMethod, ScanResult, Scope, Skill, UpdateState, UpdateStatus } from '@shared/types'
import { ProjectRootsDialog } from './components/ProjectRootsDialog'
import { Rail } from './components/Rail'
import { Sidebar, type Filters } from './components/Sidebar'
import { SkillDetail, type Tab } from './components/SkillDetail'
import { SkillList } from './components/SkillList'
import { StatusBar } from './components/StatusBar'
import { usePersistedBool } from './hooks/usePersisted'
import { useTheme } from './hooks/useTheme'
import { api } from './lib/api'
import { METHOD_LABELS } from './lib/format'

const HIDE_BUILTIN_KEY = 'sm-hide-builtin'
const FOCUS_KEY = 'sm-focus'
const SIDEBAR_KEY = 'sm-sidebar'

type Quick = 'all' | 'attention' | 'linked' | 'plugins' | 'builtin'

const QUICK: { id: Quick; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Attention' },
  { id: 'linked', label: 'Symlinked' },
  { id: 'plugins', label: 'Plugins' },
  { id: 'builtin', label: 'Built-ins' },
]

type ScanResponse = { scan: ScanResult | null; error?: string }

/** Never rejects, so it can be read with `use()`; a failed rescan keeps the previous result. */
const loadScan = (refresh: boolean, prev: ScanResult | null = null): Promise<ScanResponse> =>
  api.scan(refresh).then(
    (scan) => ({ scan }),
    (e: Error) => ({ scan: prev, error: e.message }),
  )

// Created outside the component: state set while a component suspends on first mount is discarded,
// so an initializer-created promise would restart the scan on every retry.
const firstScan = loadScan(false)

const emptyFilters = (): Filters => ({
  agents: new Set(),
  scopes: new Set(),
  methods: new Set(),
  updates: new Set(),
  hideBuiltIn: localStorage.getItem(HIDE_BUILTIN_KEY) !== '0',
})

function quickMatch(q: Quick, s: Skill, u?: UpdateStatus): boolean {
  switch (q) {
    case 'attention':
      return s.warnings.length > 0 || u?.state === 'update-available' || u?.state === 'error'
    case 'linked':
      return s.locations.some((l) => l.isSymlink)
    case 'plugins':
      return s.install.method === 'claude-plugin'
    case 'builtin':
      return s.install.method === 'codex-system'
    default:
      return true
  }
}

/** Built-ins stay hidden unless a filter asks for them explicitly. */
const hidesBuiltIns = (f: Filters, q: Quick) => f.hideBuiltIn && !f.methods.has('codex-system') && q !== 'builtin'

function syncUrl(skill: string | null, tab: Tab) {
  const url = new URL(location.href)
  if (skill) url.searchParams.set('skill', skill)
  else url.searchParams.delete('skill')
  if (tab !== 'readme') url.searchParams.set('tab', tab)
  else url.searchParams.delete('tab')
  history.replaceState(null, '', url)
}

export default function App() {
  const { theme, setTheme } = useTheme()
  const [scanPromise, setScanPromise] = useState(firstScan)
  const { scan, error: scanError } = use(scanPromise)
  const [scanning, startScan] = useTransition()
  const [updates, setUpdates] = useState<Record<string, UpdateStatus>>({})
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkingOne, setCheckingOne] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState<Quick>('all')
  const [filters, setFiltersState] = useState<Filters>(emptyFilters)
  const [chosenId, setChosenId] = useState<string | null>(() => new URLSearchParams(location.search).get('skill'))
  const [tab, setTabState] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get('tab')
    return t === 'files' || t === 'info' ? t : 'readme'
  })
  const [rootsOpen, setRootsOpen] = useState(false)
  const [focus, setFocus] = usePersistedBool(FOCUS_KEY, false)
  const [sidebarOpen, setSidebarOpen] = usePersistedBool(SIDEBAR_KEY, false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const setFilters = (f: Filters) => {
    setFiltersState(f)
    localStorage.setItem(HIDE_BUILTIN_KEY, f.hideBuiltIn ? '1' : '0')
  }

  const toggleSidebar = () => {
    setSidebarOpen(focus || !sidebarOpen)
    if (focus) setFocus(false)
  }

  const rescan = () =>
    startScan(() => {
      setScanPromise(loadScan(true, scan))
      setUpdates({})
    })

  const checkAll = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      setUpdates(await api.updates())
    } catch (e) {
      setCheckError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const checkOne = async (id: string) => {
    setCheckingOne(id)
    try {
      const u = await api.update(id)
      setUpdates((prev) => ({ ...prev, [id]: u }))
    } finally {
      setCheckingOne(null)
    }
  }

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
  const builtInHidden = hidesBuiltIns(filters, quick)

  /** Same-named skills get their plugin or install method as a suffix. */
  const subNames = useMemo(() => {
    const perName = new Map<string, number>()
    for (const s of skills) perName.set(s.name, (perName.get(s.name) ?? 0) + 1)
    const label = (s: Skill) => s.install.claudePlugin?.plugin ?? (s.install.method === 'codex-system' ? 'codex' : METHOD_LABELS[s.install.method])
    return new Map(skills.filter((s) => perName.get(s.name)! > 1).map((s) => [s.id, label(s)]))
  }, [skills])

  const quickCounts = useMemo(() => {
    const m = new Map<Quick, number>()
    for (const q of QUICK) {
      const hide = hidesBuiltIns(filters, q.id)
      m.set(q.id, skills.filter((s) => !(hide && s.install.method === 'codex-system') && quickMatch(q.id, s, updates[s.id])).length)
    }
    return m
  }, [skills, updates, filters])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return skills.filter((s) => {
      if (builtInHidden && s.install.method === 'codex-system') return false
      if (!quickMatch(quick, s, updates[s.id])) return false
      if (filters.agents.size && !s.agents.some((a) => filters.agents.has(a))) return false
      if (filters.scopes.size && !s.scopes.some((a) => filters.scopes.has(a))) return false
      if (filters.methods.size && !filters.methods.has(s.install.method)) return false
      if (filters.updates.size) {
        const u = updates[s.id]?.state
        if (!u || !filters.updates.has(u)) return false
      }
      if (q) {
        const hay = `${s.name} ${s.description ?? ''} ${s.realPath} ${s.locations.map((l) => l.path).join(' ')} ${s.install.label} ${s.install.claudePlugin?.plugin ?? ''}`.toLowerCase()
        if (!q.split(/\s+/).every((part) => hay.includes(part))) return false
      }
      return true
    })
  }, [skills, filters, query, quick, updates, builtInHidden])

  const selected = skills.find((s) => s.id === chosenId) ?? filtered[0] ?? null

  const select = (id: string) => {
    setChosenId(id)
    syncUrl(id, tab)
  }
  const setTab = (t: Tab) => {
    setTabState(t)
    syncUrl(selected?.id ?? null, t)
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName
    const typing = tag === 'INPUT' || tag === 'TEXTAREA'
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (typing) {
      if (e.key === 'Escape') (e.target as HTMLElement).blur()
      return
    }
    if (e.key === '/') {
      e.preventDefault()
      // The search box only exists outside reading mode, so leave it before focusing.
      if (focus) flushSync(() => setFocus(false))
      searchRef.current?.focus()
    } else if (e.key === '\\') {
      e.preventDefault()
      setFocus(!focus)
    } else if (e.key === '[') {
      e.preventDefault()
      toggleSidebar()
    } else if (e.key === 'j' || e.key === 'k' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!filtered.length) return
      e.preventDefault()
      const i = filtered.findIndex((s) => s.id === selected?.id)
      const dir = e.key === 'j' || e.key === 'ArrowDown' ? 1 : -1
      const next = filtered[Math.max(0, Math.min(filtered.length - 1, i + dir))]
      if (next) select(next.id)
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const updatesAvailable = Object.values(updates).filter((u) => u.state === 'update-available').length
  const error = scanError ?? checkError

  return (
    <div className="h-full flex">
      <Rail
        onCheckUpdates={checkAll}
        checking={checking}
        updatesAvailable={updatesAvailable}
        onRescan={rescan}
        scanning={scanning}
        onFolders={() => setRootsOpen(true)}
        sidebarOpen={sidebarOpen && !focus}
        onToggleSidebar={toggleSidebar}
        focus={focus}
        onToggleFocus={() => setFocus(!focus)}
        theme={theme}
        setTheme={setTheme}
      />
      {scan && sidebarOpen && !focus && (
        <Sidebar scan={scan} filters={filters} setFilters={setFilters} counts={counts} builtInCount={builtInCount} onManageRoots={() => setRootsOpen(true)} />
      )}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex-1 flex min-h-0">
          {!focus && (
            <div className="w-[300px] 2xl:w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col min-h-0">
              <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] space-y-2 shrink-0">
                <div className="flex items-center gap-2 text-[13px] font-semibold">
                  Skills
                  <span className="text-[var(--fg-faint)] font-normal tabular-nums">
                    {filtered.length} of {skills.length}
                  </span>
                  {updatesAvailable > 0 && (
                    <span className="ml-auto text-[11px] font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                      {updatesAvailable} update{updatesAvailable === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <label className="relative block">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fg-faint)]" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, description, path…"
                    aria-label="Search skills"
                    className="w-full h-7 pl-8 pr-8 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[12.5px] placeholder:text-[var(--fg-faint)] focus:border-accent-500/60 transition-colors"
                  />
                  {query ? (
                    <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost h-5 w-5 px-0 justify-center" aria-label="Clear search">
                      <X className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 kbd">/</span>
                  )}
                </label>
                <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Quick filter">
                  {QUICK.map((q) => (
                    <button key={q.id} type="button" role="radio" aria-checked={quick === q.id} className={`qchip ${quick === q.id ? 'on' : ''}`} onClick={() => setQuick(q.id)}>
                      {q.label} <span className="opacity-60">{quickCounts.get(q.id) ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
                {error && (
                  <div className="m-3 surface p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {error}
                  </div>
                )}
                {scan?.issues.length ? (
                  <div className="m-3 surface p-3 text-xs text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/5 space-y-1">
                    {scan.issues.map((i) => (
                      <div key={i} className="font-mono break-all">{i}</div>
                    ))}
                  </div>
                ) : null}
                {scan && <SkillList skills={filtered} selectedId={selected?.id ?? null} onSelect={select} updates={updates} checking={checking} subNames={subNames} />}
              </div>
            </div>
          )}
          <main className="flex-1 min-w-0 min-h-0 bg-[var(--bg)]">
            {selected && scan ? (
              <SkillDetail
                key={selected.id}
                skill={selected}
                home={scan.home}
                update={updates[selected.id]}
                checking={checking || checkingOne === selected.id}
                onCheck={() => checkOne(selected.id)}
                tab={tab}
                setTab={setTab}
                focus={focus}
                setFocus={setFocus}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-[var(--fg-faint)] gap-3">
                <Inbox className="h-10 w-10" />
                <div className="text-sm">{scan && skills.length === 0 ? 'No skills found in any known directory.' : 'Select a skill to view it.'}</div>
                {focus && (
                  <button type="button" className="btn" onClick={() => setFocus(false)}>
                    <PanelLeftOpen className="h-4 w-4" /> Show skill list
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
        <StatusBar scan={scan} shown={filtered.length} hiddenBuiltIns={builtInHidden ? builtInCount : 0} onShowBuiltIns={() => setFilters({ ...filters, hideBuiltIn: false })} />
      </div>
      {rootsOpen && scan && <ProjectRootsDialog onClose={() => setRootsOpen(false)} onSaved={rescan} home={scan.home} />}
    </div>
  )
}
