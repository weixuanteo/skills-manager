import { ArrowLeft, Compass, FolderGit2, Loader2, PanelLeftOpen, RefreshCw, Search, TriangleAlert, X } from 'lucide-react'
import { Suspense, use, useMemo, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react'
import type { InstallRequest, RemoteRepo, RemoteSkill, ScanResult, SearchHit, Skill } from '@shared/types'
import { api } from '../../lib/api'
import { InstallBar } from './InstallBar'
import { RemoteSkillDetail } from './RemoteSkillDetail'

type SearchResult = { hits: SearchHit[]; error?: string }
type RepoResult = { repo?: RemoteRepo; error?: string }

const EXAMPLES = ['mattpocock/skills', 'https://github.com/cursor/plugins/tree/main/pstack/skills']

/** owner/repo, a github.com URL, or git@github.com: — anything else is a search query. */
const looksLikeRepo = (s: string) => /^(https?:\/\/)?(www\.)?github\.com\/|^git@github\.com:/.test(s.trim()) || /^[A-Za-z0-9-]+\/[\w.-]+(\/\S*)?$/.test(s.trim())

const loadSearch = (q: string): Promise<SearchResult> =>
  api.search(q).then(
    (hits) => ({ hits }),
    (e: Error) => ({ hits: [], error: e.message }),
  )
const loadRepo = (input: string, refresh = false): Promise<RepoResult> =>
  api.repo(input, refresh).then(
    (repo) => ({ repo }),
    (e: Error) => ({ error: e.message }),
  )

let popular: Promise<SearchResult> | undefined
const loadPopular = () => (popular ??= loadSearch(''))

const formatInstalls = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))

function syncUrl(repo: string | null) {
  const url = new URL(location.href)
  if (repo) url.searchParams.set('repo', repo)
  else url.searchParams.delete('repo')
  history.replaceState(null, '', url)
}

interface Props {
  scan: ScanResult
  focus: boolean
  setFocus: (v: boolean) => void
  busy: boolean
  onInstall: (req: InstallRequest, label: string) => void
  searchRef: RefObject<HTMLInputElement | null>
}

export function Discover({ scan, focus, setFocus, busy, onInstall, searchRef }: Props) {
  const [query, setQuery] = useState('')
  const [searchPromise, setSearchPromise] = useState(loadPopular)
  const [repoInput, setRepoInput] = useState<string | null>(() => new URLSearchParams(location.search).get('repo'))
  const [repoPromise, setRepoPromise] = useState<Promise<RepoResult> | null>(() => (repoInput ? loadRepo(repoInput) : null))
  /** Skill name to preview once the repo loads, set when opening a search hit. */
  const [want, setWant] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [, startSearch] = useTransition()
  const [opening, startOpen] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Several skills can share a name across agents; match remote skills by name, case-insensitively.
  const installedByName = useMemo(() => {
    const m = new Map<string, Skill[]>()
    for (const s of scan.skills) m.set(s.name.toLowerCase(), [...(m.get(s.name.toLowerCase()) ?? []), s])
    return m
  }, [scan.skills])

  const onQuery = (q: string) => {
    setQuery(q)
    clearTimeout(timer.current)
    if (looksLikeRepo(q)) return
    // skills.sh allows about 30 searches a minute per IP.
    timer.current = setTimeout(() => startSearch(() => setSearchPromise(q.trim().length >= 2 ? loadSearch(q) : loadPopular())), 300)
  }

  const openRepo = (input: string, skillName: string | null = null) => {
    setWant(skillName)
    setFilter('')
    syncUrl(input)
    startOpen(() => {
      setRepoInput(input)
      setRepoPromise(loadRepo(input))
    })
  }
  const closeRepo = () => {
    syncUrl(null)
    setRepoInput(null)
    setRepoPromise(null)
  }
  const refreshRepo = () => repoInput && startOpen(() => setRepoPromise(loadRepo(repoInput, true)))

  const inputClass =
    'w-full h-7 pl-8 pr-8 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[12.5px] placeholder:text-[var(--fg-faint)] focus:border-accent-500/60 transition-colors'

  if (repoPromise && repoInput) {
    return (
      <Suspense key={repoInput} fallback={<Shell focus={focus} left={<Pending label={repoInput} />} main={<Placeholder icon={<Loader2 className="h-8 w-8 animate-spin" />} text={`Reading ${repoInput} from GitHub…`} />} />}>
        <RepoMode
          promise={repoPromise}
          want={want}
          filter={filter}
          setFilter={setFilter}
          inputClass={inputClass}
          searchRef={searchRef}
          onBack={closeRepo}
          onRefresh={refreshRepo}
          refreshing={opening}
          installedByName={installedByName}
          scan={scan}
          focus={focus}
          setFocus={setFocus}
          busy={busy}
          onInstall={onInstall}
        />
      </Suspense>
    )
  }

  const repoish = looksLikeRepo(query)
  return (
    <Shell
      focus={focus}
      left={
        <>
          <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] space-y-2 shrink-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              Discover
              <a href="https://skills.sh" target="_blank" rel="noreferrer noopener" className="ml-auto text-[11px] font-normal text-[var(--fg-faint)] hover:text-[var(--fg)]">
                skills.sh
              </a>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (repoish) openRepo(query.trim())
              }}
            >
              <label className="relative block">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fg-faint)]" />
                <input ref={searchRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search skills, or paste a GitHub repo…" aria-label="Search skills.sh or open a GitHub repository" className={inputClass} />
                {query ? (
                  <button type="button" onClick={() => onQuery('')} className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost h-5 w-5 px-0 justify-center" aria-label="Clear search">
                    <X className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 kbd">/</span>
                )}
              </label>
            </form>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
            {repoish ? (
              <button type="button" onClick={() => openRepo(query.trim())} className="w-full text-left flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-hover)] text-[13px]">
                {opening ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <FolderGit2 className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />}
                <span className="min-w-0">
                  <span className="block font-medium">Open repository</span>
                  <span className="block text-xs text-[var(--fg-muted)] font-mono truncate">{query.trim()}</span>
                </span>
                <span className="ml-auto kbd">↵</span>
              </button>
            ) : (
              <Suspense fallback={<Pending label="Searching skills.sh" />}>
                <SearchResults promise={searchPromise} query={query} installedByName={installedByName} onOpen={(h) => openRepo(h.source, h.name)} />
              </Suspense>
            )}
          </div>
        </>
      }
      main={
        <Placeholder
          icon={<Compass className="h-10 w-10" />}
          text="Search skills.sh, or paste a GitHub repository to browse every skill in it and pick the ones you want."
        >
          <div className="flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="btn h-7 px-2.5 text-xs font-mono" onClick={() => openRepo(ex)}>
                <FolderGit2 className="h-3.5 w-3.5" /> {ex.replace('https://github.com/', '')}
              </button>
            ))}
          </div>
          {focus && (
            <button type="button" className="btn" onClick={() => setFocus(false)}>
              <PanelLeftOpen className="h-4 w-4" /> Show list
            </button>
          )}
        </Placeholder>
      }
    />
  )
}

function Shell({ focus, left, main }: { focus: boolean; left: ReactNode; main: ReactNode }) {
  return (
    <div className="flex-1 flex min-h-0">
      {!focus && <div className="w-[300px] 2xl:w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col min-h-0">{left}</div>}
      <main className="flex-1 min-w-0 min-h-0 bg-[var(--bg)]">{main}</main>
    </div>
  )
}

function Placeholder({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-[var(--fg-faint)] gap-3 px-6 text-center">
      {icon}
      <div className="text-sm max-w-md">{text}</div>
      {children}
    </div>
  )
}

function Pending({ label }: { label: string }) {
  return (
    <div className="p-4 text-[13px] text-[var(--fg-muted)] flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin shrink-0" /> <span className="truncate">{label}…</span>
    </div>
  )
}

function SearchResults({ promise, query, installedByName, onOpen }: { promise: Promise<SearchResult>; query: string; installedByName: Map<string, Skill[]>; onOpen: (h: SearchHit) => void }) {
  const { hits, error } = use(promise)
  if (error) {
    return (
      <div className="m-3 surface p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
        <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {error}
      </div>
    )
  }
  if (!hits.length) return <div className="p-6 text-center text-[13px] text-[var(--fg-muted)]">No skills on skills.sh match “{query.trim()}”.</div>
  return (
    <>
      <div className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-[var(--fg-faint)]">{query.trim().length >= 2 ? 'Results' : 'Most installed'}</div>
      <ul>
        {hits.map((h) => (
          <li key={h.id}>
            <button type="button" onClick={() => onOpen(h)} className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 px-3 py-[7px] hover:bg-[var(--bg-hover)]" title={`Open ${h.source} and preview ${h.name}`}>
              <span className="truncate text-[13px] font-medium">{h.name}</span>
              <span className="text-[11px] tabular-nums text-[var(--fg-faint)] whitespace-nowrap">
                {installedByName.has(h.name.toLowerCase()) && <span className="text-emerald-700 dark:text-emerald-400 mr-1.5">installed</span>}
                {formatInstalls(h.installs)}
              </span>
              <span className="col-span-2 text-xs text-[var(--fg-muted)] font-mono truncate">{h.source}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

interface RepoModeProps {
  promise: Promise<RepoResult>
  want: string | null
  filter: string
  setFilter: (v: string) => void
  inputClass: string
  searchRef: RefObject<HTMLInputElement | null>
  onBack: () => void
  onRefresh: () => void
  refreshing: boolean
  installedByName: Map<string, Skill[]>
  scan: ScanResult
  focus: boolean
  setFocus: (v: boolean) => void
  busy: boolean
  onInstall: (req: InstallRequest, label: string) => void
}

/** Groups skills by their parent directory, minus the prefix every group shares. */
function groupSkills(skills: RemoteSkill[]): { label: string; skills: RemoteSkill[] }[] {
  const parent = (s: RemoteSkill) => (s.dir.includes('/') ? s.dir.slice(0, s.dir.lastIndexOf('/')) : '')
  const groups = new Map<string, RemoteSkill[]>()
  for (const s of skills) groups.set(parent(s), [...(groups.get(parent(s)) ?? []), s])
  const keys = [...groups.keys()]
  let common = keys.length > 1 ? keys[0] : ''
  for (const k of keys) while (common && k !== common && !k.startsWith(common + '/')) common = common.includes('/') ? common.slice(0, common.lastIndexOf('/')) : ''
  return keys.map((k) => ({ label: (common ? k.slice(common.length + 1) : k) || '(top level)', skills: groups.get(k)! }))
}

function RepoMode({ promise, want, filter, setFilter, inputClass, searchRef, onBack, onRefresh, refreshing, installedByName, scan, focus, setFocus, busy, onInstall }: RepoModeProps) {
  const { repo, error } = use(promise)
  const [previewDir, setPreviewDir] = useState<string | null>(() => repo?.skills.find((s) => want && s.name.toLowerCase() === want.toLowerCase())?.dir ?? null)
  // Picks belong to one commit: after a refresh the files behind them may have changed.
  const [pickState, setPickState] = useState<{ sha?: string; dirs: string[] }>({ sha: repo?.sha, dirs: [] })
  const picked = pickState.sha === repo?.sha ? pickState.dirs : []
  const setPicked = (fn: (dirs: string[]) => string[]) => setPickState({ sha: repo?.sha, dirs: fn(picked) })

  const back = (
    <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={onBack} title="Back to search" aria-label="Back to search">
      <ArrowLeft className="h-3.5 w-3.5" />
    </button>
  )

  if (!repo) {
    return (
      <Shell
        focus={focus}
        left={
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold">{back} Repository</div>
            <div className="surface p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
              <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {error}
            </div>
          </div>
        }
        main={<Placeholder icon={<TriangleAlert className="h-10 w-10" />} text="Couldn't read that repository." />}
      />
    )
  }

  const q = filter.trim().toLowerCase()
  const shown = q ? repo.skills.filter((s) => `${s.name} ${s.description} ${s.dir}`.toLowerCase().includes(q)) : repo.skills
  const groups = groupSkills(shown)
  const preview = repo.skills.find((s) => s.dir === previewDir) ?? shown[0] ?? repo.skills[0]
  const toggle = (dir: string) => setPicked((p) => (p.includes(dir) ? p.filter((d) => d !== dir) : [...p, dir]))
  const allShownPicked = shown.length > 0 && shown.every((s) => picked.includes(s.dir))
  const toggleShown = () => setPicked((p) => (allShownPicked ? p.filter((d) => !shown.some((s) => s.dir === d)) : [...new Set([...p, ...shown.map((s) => s.dir)])]))
  // Keep picks in list order so the install command reads like the list.
  const pickedInOrder = repo.skills.filter((s) => picked.includes(s.dir)).map((s) => s.dir)

  return (
    <Shell
      focus={focus}
      left={
        <>
          <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] space-y-2 shrink-0">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold min-w-0">
              {back}
              <span className="truncate font-mono text-[12.5px]" title={`${repo.owner}/${repo.repo}${repo.subpath ? '/' + repo.subpath : ''}`}>
                {repo.owner}/{repo.repo}
              </span>
              <span className="ml-auto text-[11px] font-normal font-mono text-[var(--fg-faint)]" title={repo.sha}>
                {repo.ref ?? 'HEAD'}@{repo.sha.slice(0, 7)}
              </span>
              <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={onRefresh} disabled={refreshing} title="Re-read from GitHub" aria-label="Re-read from GitHub">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {repo.subpath && <div className="text-[11px] font-mono text-[var(--fg-muted)] truncate -mt-1">{repo.subpath}/</div>}
            <label className="relative block">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--fg-faint)]" />
              <input ref={searchRef} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Filter ${repo.skills.length} skills…`} aria-label="Filter skills in this repository" className={inputClass} />
              {filter ? (
                <button type="button" onClick={() => setFilter('')} className="absolute right-1 top-1/2 -translate-y-1/2 btn btn-ghost h-5 w-5 px-0 justify-center" aria-label="Clear filter">
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 kbd">/</span>
              )}
            </label>
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--fg-muted)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={allShownPicked} onChange={toggleShown} disabled={!shown.length} className="accent-accent-600" />
                {q ? 'Select matching' : 'Select all'}
              </label>
              <span className="ml-auto tabular-nums">{picked.length ? `${picked.length} selected` : `${shown.length} skill${shown.length === 1 ? '' : 's'}`}</span>
              {picked.length > 0 && (
                <button type="button" className="text-accent-600 dark:text-accent-300 hover:underline" onClick={() => setPicked(() => [])}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
            {repo.skipped.length > 0 && (
              <details className="m-3 surface p-2.5 text-xs text-amber-800 dark:text-amber-300 border-amber-500/30 bg-amber-500/5">
                <summary className="cursor-pointer">
                  {repo.skipped.length} director{repo.skipped.length === 1 ? 'y' : 'ies'} skipped
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {repo.skipped.map((s) => (
                    <li key={s.dir + s.reason}>
                      <span className="font-mono">{s.dir || '/'}</span>: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {!repo.skills.length && <div className="p-6 text-center text-[13px] text-[var(--fg-muted)]">No SKILL.md files found here.</div>}
            {groups.map((g) => (
              <div key={g.label}>
                {groups.length > 1 && <div className="px-3 pt-2.5 pb-1 text-[11px] uppercase tracking-wide text-[var(--fg-faint)] font-mono normal-case">{g.label}</div>}
                <ul aria-label={g.label}>
                  {g.skills.map((s) => {
                    const active = s.dir === preview?.dir
                    const installed = installedByName.has(s.name.toLowerCase())
                    return (
                      <li key={s.dir} className={`flex items-start border-l-2 transition-colors ${active ? 'bg-accent-500/10 border-accent-500' : 'border-transparent hover:bg-[var(--bg-hover)]'}`}>
                        <input type="checkbox" checked={picked.includes(s.dir)} onChange={() => toggle(s.dir)} aria-label={`Select ${s.name}`} className="mt-[10px] ml-3 shrink-0 accent-accent-600" />
                        <button type="button" onClick={() => setPreviewDir(s.dir)} aria-current={active || undefined} className="flex-1 min-w-0 text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 pl-2 pr-3 py-[7px]">
                          <span className={`truncate text-[13px] font-medium ${active ? 'text-accent-800 dark:text-accent-100' : ''}`}>{s.name}</span>
                          <span className="text-[11px] whitespace-nowrap">{installed && <span className="text-emerald-700 dark:text-emerald-400">installed</span>}</span>
                          <span className="col-span-2 text-xs text-[var(--fg-muted)] truncate">{s.description}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      }
      main={
        preview ? (
          <RemoteSkillDetail
            key={`${repo.sha}:${preview.dir}`}
            repo={repo}
            skill={preview}
            installed={installedByName.get(preview.name.toLowerCase()) ?? []}
            focus={focus}
            setFocus={setFocus}
            footer={<InstallBar repo={repo} picked={pickedInOrder} previewDir={preview.dir} scan={scan} busy={busy} onInstall={onInstall} />}
          />
        ) : (
          <Placeholder icon={<FolderGit2 className="h-10 w-10" />} text="Nothing to preview." />
        )
      }
    />
  )
}
