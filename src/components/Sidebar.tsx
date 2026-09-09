import { Check, EyeOff, FolderPlus, HardDrive } from 'lucide-react'
import type { AgentId, InstallMethod, ScanResult, Scope, UpdateState } from '@shared/types'
import { AGENT_LABELS, METHOD_LABELS, UPDATE_LABELS, tildify } from '../lib/format'

export interface Filters {
  agents: Set<AgentId>
  scopes: Set<Scope>
  methods: Set<InstallMethod>
  updates: Set<UpdateState>
  /** Hide skills bundled with the Codex CLI unless the "Codex built-in" method filter is selected. */
  hideBuiltIn: boolean
}

interface Props {
  scan: ScanResult
  filters: Filters
  setFilters: (f: Filters) => void
  counts: { agents: Map<AgentId, number>; scopes: Map<Scope, number>; methods: Map<InstallMethod, number>; updates: Map<UpdateState, number> }
  builtInCount: number
  onManageRoots: () => void
}

function FilterGroup<T extends string>({ title, items, labels, active, counts, onToggle }: { title: string; items: T[]; labels: Record<T, string>; active: Set<T>; counts: Map<T, number>; onToggle: (v: T) => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">{title}</div>
      <ul className="space-y-0.5">
        {items.map((v) => {
          const on = active.has(v)
          return (
            <li key={v}>
              <button
                type="button"
                onClick={() => onToggle(v)}
                className={`w-full flex items-center gap-2 h-7 px-2 rounded-md text-[13px] transition-colors ${on ? 'bg-accent-500/10 text-accent-800 dark:text-accent-100' : 'hover:bg-[var(--bg-hover)] text-[var(--fg-muted)]'}`}
              >
                <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${on ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400' : 'border-[var(--border-strong)]'}`}>
                  {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                </span>
                <span className="truncate flex-1 text-left">{labels[v]}</span>
                <span className="text-[11px] tabular-nums text-[var(--fg-faint)]">{counts.get(v) ?? 0}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function Sidebar({ scan, filters, setFilters, counts, builtInCount, onManageRoots }: Props) {
  const toggle = <K extends keyof Filters>(key: K, v: Filters[K] extends Set<infer U> ? U : never) => {
    const next = new Set(filters[key] as Set<unknown>)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setFilters({ ...filters, [key]: next })
  }
  const agents = [...counts.agents.keys()].sort()
  const methods = [...counts.methods.keys()].sort()
  const updates = (['update-available', 'up-to-date', 'local-ahead', 'unknown', 'error', 'unsupported'] as UpdateState[]).filter((u) => counts.updates.has(u))
  const existingRoots = scan.roots.filter((r) => r.exists)

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto scroll-thin p-3 space-y-5">
        {builtInCount > 0 && (
          <div>
            <div className="px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">Visibility</div>
            <button
              type="button"
              role="switch"
              aria-checked={filters.hideBuiltIn}
              onClick={() => setFilters({ ...filters, hideBuiltIn: !filters.hideBuiltIn })}
              title="Codex ships its own skills in ~/.codex/skills/.system. Hide them to focus on skills you installed."
              className={`w-full flex items-center gap-2 h-8 px-2 rounded-md text-[13px] transition-colors ${filters.hideBuiltIn ? 'bg-accent-500/10 text-accent-800 dark:text-accent-100' : 'hover:bg-[var(--bg-hover)] text-[var(--fg-muted)]'}`}
            >
              <EyeOff className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate flex-1 text-left">Hide Codex built-ins</span>
              <span
                aria-hidden="true"
                className={`relative block h-4 w-7 shrink-0 rounded-full transition-colors ${filters.hideBuiltIn ? 'bg-accent-600 dark:bg-accent-400' : 'bg-[var(--border-strong)]'}`}
              >
                <span
                  className={`absolute left-0.5 top-0.5 block h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-150 ${filters.hideBuiltIn ? 'translate-x-3' : 'translate-x-0'}`}
                />
              </span>
            </button>
            {filters.hideBuiltIn && !filters.methods.has('codex-system') && (
              <div className="px-2 mt-1 text-[11px] text-[var(--fg-faint)]">{builtInCount} hidden · selecting the “Codex built-in” method filter shows them too.</div>
            )}
          </div>
        )}
        <FilterGroup title="Agent" items={agents} labels={AGENT_LABELS} active={filters.agents} counts={counts.agents} onToggle={(v) => toggle('agents', v)} />
        <FilterGroup title="Scope" items={[...counts.scopes.keys()]} labels={{ global: 'Global (~)', project: 'Project' }} active={filters.scopes} counts={counts.scopes} onToggle={(v) => toggle('scopes', v)} />
        <FilterGroup title="Install method" items={methods} labels={METHOD_LABELS} active={filters.methods} counts={counts.methods} onToggle={(v) => toggle('methods', v)} />
        <FilterGroup title="Update status" items={updates} labels={UPDATE_LABELS} active={filters.updates} counts={counts.updates} onToggle={(v) => toggle('updates', v)} />

        <div>
          <div className="px-2 mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]">Scanned locations</span>
            <button type="button" onClick={onManageRoots} className="btn btn-ghost h-6 w-6 px-0 justify-center" title="Add a project directory to scan">
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="space-y-0.5">
            {existingRoots.map((r) => (
              <li key={r.path} className="flex items-center gap-2 px-2 h-7 text-[12px] text-[var(--fg-muted)]" title={r.path}>
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-[var(--fg-faint)]" />
                <span className="truncate font-mono flex-1">{tildify(r.path, scan.home)}</span>
                <span className="tabular-nums text-[var(--fg-faint)]">{r.skillCount}</span>
              </li>
            ))}
            {existingRoots.length === 0 && <li className="px-2 text-xs text-[var(--fg-faint)]">No skill directories found.</li>}
          </ul>
          {scan.projectRoots.length === 0 && (
            <button type="button" onClick={onManageRoots} className="mt-2 mx-2 text-[12px] text-accent-600 dark:text-accent-300 hover:underline">
              + Add a project folder
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
