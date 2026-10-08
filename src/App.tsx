import { Inbox, Loader2, PanelLeftOpen, Search, TriangleAlert, X } from 'lucide-react'
import { type ReactNode, startTransition, Suspense, type TransitionStartFunction, use, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import { flushSync } from 'react-dom'
import type { ActionResult, AgentId, InstallMethod, ScanResult, Scope, Skill, UpdateState, UpdateStatus } from '@shared/types'
import { ActionPanel, type ActionState } from './components/ActionPanel'
import { ClaudeIcon, CodexIcon } from './components/BrandIcons'
import { CommandLog } from './components/CommandLog'
import { Discover } from './components/discover/Discover'
import { ProjectRootsDialog } from './components/ProjectRootsDialog'
import { Rail } from './components/Rail'
import { Sidebar } from './components/Sidebar'
import { type DetailHandle, SkillDetail, type Tab } from './components/SkillDetail'
import { SkillList } from './components/SkillList'
import { StatusBar } from './components/StatusBar'
import { usePersistedBool } from './hooks/usePersisted'
import { useTheme } from './hooks/useTheme'
import { api, loadLog } from './lib/api'
import {
  SOURCES,
  SOURCE_LABELS,
  SOURCE_METHODS,
  emptyFacets,
  facetAgents,
  facetCount,
  failedDims,
  matchesQuery,
  needsAttention,
  skillSource,
  type Dim,
  type Facets,
  type Source,
  type SourceView,
} from './lib/filters'
import { METHOD_LABELS } from './lib/format'

const SOURCE_KEY = 'sm-source'
const FOCUS_KEY = 'sm-focus'
const SIDEBAR_KEY = 'sm-sidebar'

const SOURCE_HINTS: Record<SourceView, string> = {
  mine: 'Skills you installed or wrote yourself',
  plugins: 'Skills bundled with installed Claude Code plugins',
  builtin: 'Skills that ship with Codex',
  all: 'Every scanned skill',
}

/** The brand mark says whose ecosystem the skills come from, matching the badges on their rows. */
const SOURCE_ICONS: Partial<Record<SourceView, ReactNode>> = {
  plugins: <ClaudeIcon className="h-3 w-3 shrink-0 text-orange-600 dark:text-orange-300" />,
  builtin: <CodexIcon className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-300" />,
}

const isSourceView = (v: string | null): v is SourceView => v !== null && v in SOURCE_LABELS

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

const bump = <K,>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1)

/**
 * An update status holds for the install it was checked against. Rescans keep it until that install changes
 * (an update run here or in a terminal), and a check that finishes after such a rescan never applies.
 */
type Checked = { install: string; status: UpdateStatus }
const installKey = (s: Skill) => JSON.stringify(s.install)

export type Page = 'installed' | 'discover' | 'log'

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
  const [reloading, startReload] = useTransition()
  const lastReload = useRef(0)
  const detailRef = useRef<DetailHandle>(null)
  const [checked, setChecked] = useState<Record<string, Checked>>({})
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkingOne, setCheckingOne] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [facets, setFacets] = useState<Facets>(emptyFacets)
  const [chosenId, setChosenId] = useState<string | null>(() => new URLSearchParams(location.search).get('skill'))
  // A deep link to a skill outside the saved source opens that skill's source instead, without saving it.
  const [source, setSourceState] = useState<SourceView>(() => {
    const stored = localStorage.getItem(SOURCE_KEY)
    const saved = isSourceView(stored) ? stored : 'mine'
    const linked = scan?.skills.find((s) => s.id === chosenId)
    return linked && saved !== 'all' && skillSource(linked) !== saved ? skillSource(linked) : saved
  })
  const [tab, setTabState] = useState<Tab>(() => {
    const t = new URLSearchParams(location.search).get('tab')
    return t === 'files' || t === 'info' ? t : 'readme'
  })
  const [page, setPageState] = useState<Page>(() => {
    const v = new URLSearchParams(location.search).get('view')
    return v === 'discover' || v === 'log' ? v : 'installed'
  })
  const [logPromise, setLogPromise] = useState(() => (page === 'log' ? loadLog() : null))
  // Read when a run finishes, which can be after the page changed; only setPage writes it.
  const pageRef = useRef(page)
  const [action, setAction] = useState<ActionState | null>(null)
  const [rootsOpen, setRootsOpen] = useState(false)
  const [focus, setFocus] = usePersistedBool(FOCUS_KEY, false)
  const [sidebarOpen, setSidebarOpen] = usePersistedBool(SIDEBAR_KEY, false)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const setSource = (v: SourceView) => {
    setSourceState(v)
    localStorage.setItem(SOURCE_KEY, v)
  }

  const toggleSidebar = () => {
    setSidebarOpen(focus || !sidebarOpen)
    if (focus) setFocus(false)
  }

  const setPage = (v: Page) => {
    setPageState(v)
    pageRef.current = v
    if (v === 'log') setLogPromise(loadLog())
    const url = new URL(location.href)
    if (v === 'installed') url.searchParams.delete('view')
    else url.searchParams.set('view', v)
    if (v !== 'discover') url.searchParams.delete('repo')
    history.replaceState(null, '', url)
  }

  /** Runs a mutating command on the server, then rescans (and rereads the log, if it is open) to reflect it. */
  const runAction = async (label: string, command: string, fn: () => Promise<ActionResult>) => {
    setAction({ label, command, running: true })
    try {
      setAction({ label, command, running: false, result: await fn() })
    } catch (e) {
      setAction({ label, command, running: false, error: (e as Error).message })
    }
    reload()
    if (pageRef.current === 'log') startTransition(() => setLogPromise(loadLog()))
  }

  /** Rescans and rereads the open document in one transition, so the current view stays up until both arrive. */
  const reloadIn = (start: TransitionStartFunction) => {
    lastReload.current = Date.now()
    start(() => {
      setScanPromise(loadScan(true, scan))
      detailRef.current?.reload()
    })
  }
  const reload = () => reloadIn(startReload)

  const skills = scan?.skills ?? []

  const checkAll = async () => {
    const installs = new Map(skills.map((s) => [s.id, installKey(s)]))
    setChecking(true)
    setCheckError(null)
    try {
      const next: Record<string, Checked> = {}
      for (const [id, status] of Object.entries(await api.updates())) {
        const install = installs.get(id)
        if (install) next[id] = { install, status }
      }
      setChecked(next)
    } catch (e) {
      setCheckError((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  const checkOne = async (skill: Skill) => {
    const install = installKey(skill)
    setCheckingOne(skill.id)
    try {
      const status = await api.update(skill.id)
      setChecked((prev) => ({ ...prev, [skill.id]: { install, status } }))
    } finally {
      setCheckingOne(null)
    }
  }

  const updates = useMemo(() => {
    const out: Record<string, UpdateStatus> = {}
    for (const s of skills) {
      const c = checked[s.id]
      if (c?.install === installKey(s)) out[s.id] = c.status
    }
    return out
  }, [skills, checked])

  /** Same-named skills get their plugin or install method as a suffix. */
  const subNames = useMemo(() => {
    const perName = new Map<string, number>()
    for (const s of skills) perName.set(s.name, (perName.get(s.name) ?? 0) + 1)
    const label = (s: Skill) => s.install.claudePlugin?.plugin ?? (s.install.method === 'codex-system' ? 'codex' : METHOD_LABELS[s.install.method])
    return new Map(skills.filter((s) => perName.get(s.name)! > 1).map((s) => [s.id, label(s)]))
  }, [skills])

  /**
   * One pass builds the list and every count. A skill counts toward a dimension when it passes all the
   * others, so each count says what selecting that option would show.
   */
  const view = useMemo(() => {
    const totals = new Set(skills.map(skillSource))
    const segments: SourceView[] = SOURCES.filter((x) => totals.has(x))
    if (segments.length > 1) segments.push('all')
    const active: SourceView = segments.includes(source) ? source : 'all'
    const shown: Skill[] = []
    const counts = {
      sources: new Map<SourceView, number>(),
      sourceAttention: new Set<SourceView>(),
      agents: new Map<AgentId, number>(),
      scopes: new Map<Scope, number>(),
      methods: new Map<InstallMethod, number>(),
      updates: new Map<UpdateState, number>(),
      attention: 0,
    }
    for (const s of skills) {
      if (!matchesQuery(s, query)) continue
      const u = updates[s.id]
      const fails = failedDims(s, active, facets, u)
      const tally = (d: Dim) => fails.length === 0 || (fails.length === 1 && fails[0] === d)
      const attention = needsAttention(s, u)
      if (fails.length === 0) shown.push(s)
      if (tally('source')) {
        const src: Source = skillSource(s)
        bump(counts.sources, src)
        bump(counts.sources, 'all')
        if (attention) counts.sourceAttention.add(src).add('all')
      }
      if (tally('agents')) for (const a of facetAgents(s)) bump(counts.agents, a)
      if (tally('scopes')) for (const x of s.scopes) bump(counts.scopes, x)
      if (tally('methods') && !SOURCE_METHODS.has(s.install.method)) bump(counts.methods, s.install.method)
      if (tally('updates') && u) bump(counts.updates, u.state)
      if (tally('attention') && attention) counts.attention++
    }
    return { segments, active, shown, counts }
  }, [skills, source, facets, query, updates])

  const filtered = view.shown
  const refinements = facetCount(facets)

  const selected = filtered.find((s) => s.id === chosenId) ?? filtered[0] ?? null

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
    } else if (e.key === 'r') {
      e.preventDefault()
      reload()
    } else if (page !== 'installed') {
      return
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
    } else if (/^[1-9]$/.test(e.key) && view.segments.length > 1) {
      const seg = view.segments[Number(e.key) - 1]
      if (!seg) return
      e.preventDefault()
      setSource(seg)
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Returning from an editor or terminal shows what changed there, without a spinner since nobody asked.
  // A running command rescans when it finishes; the throttle folds the focus and visibilitychange that arrive together.
  const onReturn = useEffectEvent(() => {
    if (document.visibilityState !== 'visible' || action?.running || Date.now() - lastReload.current < 1000) return
    reloadIn(startTransition)
  })

  useEffect(() => {
    const handler = () => onReturn()
    window.addEventListener('focus', handler)
    document.addEventListener('visibilitychange', handler)
    return () => {
      window.removeEventListener('focus', handler)
      document.removeEventListener('visibilitychange', handler)
    }
  }, [])

  const updatesAvailable = Object.values(updates).filter((u) => u.state === 'update-available').length
  const error = scanError ?? checkError

  return (
    <div className="h-full flex">
      <Rail
        page={page}
        onPage={setPage}
        onCheckUpdates={checkAll}
        checking={checking}
        updatesAvailable={updatesAvailable}
        onReload={reload}
        reloading={reloading}
        onFolders={() => setRootsOpen(true)}
        sidebarOpen={sidebarOpen && !focus}
        onToggleSidebar={toggleSidebar}
        filtersActive={refinements > 0}
        focus={focus}
        onToggleFocus={() => setFocus(!focus)}
        theme={theme}
        setTheme={setTheme}
      />
      {scan && sidebarOpen && !focus && page === 'installed' && (
        <Sidebar scan={scan} facets={facets} setFacets={setFacets} counts={view.counts} onManageRoots={() => setRootsOpen(true)} />
      )}
      <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
        {page === 'log' && logPromise ? (
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center text-[var(--fg-faint)]">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            }
          >
            <CommandLog promise={logPromise} home={scan?.home ?? ''} focus={focus} />
          </Suspense>
        ) : page === 'discover' && scan ? (
          <Discover
            scan={scan}
            focus={focus}
            setFocus={setFocus}
            busy={!!action?.running}
            onInstall={(req, label, command) => runAction(label, command, () => api.install(req))}
            searchRef={searchRef}
          />
        ) : (
          <div className="flex-1 flex min-h-0">
            {!focus && (
              <div className="w-[300px] 2xl:w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col min-h-0">
                <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] space-y-2 shrink-0">
                  <div className="flex items-center gap-2 text-[13px] font-semibold">
                    Skills
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
                  {view.segments.length > 1 && (
                    <div className="seg" role="radiogroup" aria-label="Source">
                      {view.segments.map((id, i) => {
                        const on = view.active === id
                        return (
                          <button key={id} type="button" role="radio" aria-checked={on} className={`seg-btn ${on ? 'on' : ''}`} onClick={() => setSource(id)} title={`${SOURCE_HINTS[id]} (${i + 1})`}>
                            {SOURCE_ICONS[id]}
                            {SOURCE_LABELS[id]} <span className="opacity-60">{view.counts.sources.get(id) ?? 0}</span>
                            {!on && view.counts.sourceAttention.has(id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" role="img" aria-label="Needs attention" title="Some skills here need attention" />}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {(view.counts.attention > 0 || facets.attention || refinements > 0) && (
                    <div className="flex items-center gap-2 text-[11.5px]">
                      {(view.counts.attention > 0 || facets.attention) && (
                        <button type="button" aria-pressed={facets.attention} className={`qchip ${facets.attention ? 'on' : ''}`} onClick={() => setFacets({ ...facets, attention: !facets.attention })}>
                          <TriangleAlert className="h-3 w-3" /> Needs attention <span className="opacity-60">{view.counts.attention}</span>
                        </button>
                      )}
                      {refinements > 0 && (
                        <span className="ml-auto flex items-center gap-1.5 text-[var(--fg-muted)] tabular-nums">
                          <button type="button" className="hover:text-[var(--fg)] hover:underline" onClick={() => setSidebarOpen(true)} title="Show filters ([)">
                            {refinements} filter{refinements === 1 ? '' : 's'}
                          </button>
                          ·
                          <button type="button" className="text-accent-600 dark:text-accent-300 hover:underline" onClick={() => setFacets({ ...emptyFacets(), attention: facets.attention })}>
                            Clear
                          </button>
                        </span>
                      )}
                    </div>
                  )}
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
                  {scan &&
                    (filtered.length || !skills.length ? (
                      <SkillList skills={filtered} selectedId={selected?.id ?? null} onSelect={select} updates={updates} checking={checking} subNames={subNames} />
                    ) : (
                      <NoMatches
                        active={view.active}
                        query={query}
                        elsewhere={view.segments.filter((id) => id !== view.active && id !== 'all').map((id) => ({ id, count: view.counts.sources.get(id) ?? 0 })).filter((x) => x.count > 0)}
                        onSource={setSource}
                        onClear={facets.attention || refinements > 0 ? () => setFacets(emptyFacets()) : undefined}
                      />
                    ))}
                </div>
              </div>
            )}
            <main className="flex-1 min-w-0 min-h-0 bg-[var(--bg)]">
              {selected && scan ? (
                <SkillDetail
                  key={selected.id}
                  ref={detailRef}
                  skill={selected}
                  home={scan.home}
                  update={updates[selected.id]}
                  checking={checking || checkingOne === selected.id}
                  onCheck={() => checkOne(selected)}
                  tab={tab}
                  setTab={setTab}
                  focus={focus}
                  setFocus={setFocus}
                  busy={!!action?.running}
                  onRun={(cmd) => runAction(`${cmd.title} · ${selected.name}`, cmd.command, () => api.run(selected.id, cmd.command))}
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
        )}
        {action && (
          <ActionPanel
            key={action.label + action.running}
            action={action}
            onClose={() => setAction(null)}
            onOpenLog={
              page === 'log'
                ? undefined
                : () => {
                    // The log shows this run in full, so the panel would only cover it.
                    setAction(null)
                    setPage('log')
                  }
            }
          />
        )}
        <StatusBar scan={scan} shown={filtered.length} sourceKeys={view.segments.length > 1 ? view.segments.length : 0} page={page} />
      </div>
      {rootsOpen && scan && <ProjectRootsDialog onClose={() => setRootsOpen(false)} onSaved={reload} home={scan.home} />}
    </div>
  )
}

function NoMatches({ active, query, elsewhere, onSource, onClear }: { active: SourceView; query: string; elsewhere: { id: SourceView; count: number }[]; onSource: (v: SourceView) => void; onClear?: () => void }) {
  const q = query.trim()
  return (
    <div className="p-6 text-center text-[13px] text-[var(--fg-muted)] space-y-3">
      <div>
        Nothing{active !== 'all' && ` in ${SOURCE_LABELS[active]}`} matches {q ? <span className="text-[var(--fg)]">“{q}”</span> : 'these filters'}.
      </div>
      {(elsewhere.length > 0 || onClear) && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {elsewhere.map((x) => (
            <button key={x.id} type="button" className="btn h-7 px-2.5 text-xs" onClick={() => onSource(x.id)}>
              {x.count} in {SOURCE_LABELS[x.id]}
            </button>
          ))}
          {onClear && (
            <button type="button" className="btn btn-ghost h-7 px-2.5 text-xs" onClick={onClear}>
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
