import { Check, ChevronRight, FolderPlus, HardDrive, Puzzle } from 'lucide-react'
import type { AgentId, InstallMethod, ScanResult, Scope, UpdateState } from '@shared/types'
import type { Facets } from '../lib/filters'
import { AGENT_LABELS, METHOD_LABELS, UPDATE_LABELS, tildify } from '../lib/format'

interface Props {
  scan: ScanResult
  facets: Facets
  setFacets: (f: Facets) => void
  counts: { agents: Map<AgentId, number>; scopes: Map<Scope, number>; methods: Map<InstallMethod, number>; updates: Map<UpdateState, number> }
  onManageRoots: () => void
}

const UPDATE_ORDER: UpdateState[] = ['update-available', 'up-to-date', 'local-ahead', 'unknown', 'error', 'unsupported']
const SCOPE_LABELS: Record<Scope, string> = { global: 'Global (~)', project: 'Project' }

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (!next.delete(value)) next.add(value)
  return next
}

const heading = 'px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-faint)]'

interface Group {
  title: string
  rows: { value: string; label: string; on: boolean; count: number; toggle: () => void }[]
}

/** A group with a single option cannot narrow anything, so it only shows while one of its options is selected. */
function group<T extends string>(title: string, order: T[], labels: Record<T, string>, active: Set<T>, counts: Map<T, number>, onToggle: (v: T) => void): Group | null {
  const items = order.filter((v) => counts.has(v) || active.has(v))
  if (items.length < 2 && active.size === 0) return null
  return { title, rows: items.map((v) => ({ value: v, label: labels[v], on: active.has(v), count: counts.get(v) ?? 0, toggle: () => onToggle(v) })) }
}

function FilterGroup({ title, rows }: Group) {
  return (
    <div>
      <div className={heading}>{title}</div>
      <ul className="space-y-0.5">
        {rows.map(({ value, label, on, count, toggle }) => (
          <li key={value}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={toggle}
              className={`w-full flex items-center gap-2 h-7 px-2 rounded-md text-[13px] transition-colors ${on ? 'bg-accent-500/10 text-accent-800 dark:text-accent-100' : 'hover:bg-[var(--bg-hover)] text-[var(--fg-muted)]'}`}
            >
              <span className={`h-3.5 w-3.5 rounded border flex items-center justify-center ${on ? 'bg-accent-600 border-accent-600 text-white dark:bg-accent-400 dark:border-accent-400' : 'border-[var(--border-strong)]'}`}>
                {on && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="truncate flex-1 text-left">{label}</span>
              <span className="text-[11px] tabular-nums text-[var(--fg-faint)]">{count}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Sidebar({ scan, facets, setFacets, counts, onManageRoots }: Props) {
  const roots = scan.roots.filter((r) => r.exists)
  const dirs = roots.filter((r) => r.agent !== 'claude-plugin')
  const plugins = new Map<string, { count: number; paths: string[] }>()
  for (const r of roots) {
    if (r.agent !== 'claude-plugin') continue
    const p = plugins.get(r.label) ?? { count: 0, paths: [] }
    p.count += r.skillCount
    p.paths.push(tildify(r.path, scan.home))
    plugins.set(r.label, p)
  }
  const pluginSkills = [...plugins.values()].reduce((n, p) => n + p.count, 0)

  const groups = [
    group('Agent', (Object.keys(AGENT_LABELS) as AgentId[]).sort(), AGENT_LABELS, facets.agents, counts.agents, (v) => setFacets({ ...facets, agents: toggled(facets.agents, v) })),
    group('Scope', ['global', 'project'] as Scope[], SCOPE_LABELS, facets.scopes, counts.scopes, (v) => setFacets({ ...facets, scopes: toggled(facets.scopes, v) })),
    group('Install method', (Object.keys(METHOD_LABELS) as InstallMethod[]).sort(), METHOD_LABELS, facets.methods, counts.methods, (v) => setFacets({ ...facets, methods: toggled(facets.methods, v) })),
    group('Update status', UPDATE_ORDER, UPDATE_LABELS, facets.updates, counts.updates, (v) => setFacets({ ...facets, updates: toggled(facets.updates, v) })),
  ].filter((g) => g !== null)

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--border)] bg-[var(--bg)] flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto scroll-thin p-3 space-y-5">
        {groups.length ? groups.map((g) => <FilterGroup key={g.title} {...g} />) : <div className="px-2 text-[12px] text-[var(--fg-faint)]">Nothing to narrow down in this view.</div>}

        <div>
          <div className={`${heading} flex items-center justify-between`}>
            <span>Scanned locations</span>
            <button type="button" onClick={onManageRoots} className="btn btn-ghost h-6 w-6 px-0 justify-center normal-case" title="Add a project directory to scan">
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="space-y-0.5">
            {dirs.map((r) => (
              <li key={r.path} className="flex items-center gap-2 px-2 h-7 text-[12px] text-[var(--fg-muted)]" title={r.path}>
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-[var(--fg-faint)]" />
                <span className="truncate font-mono flex-1">{tildify(r.path, scan.home)}</span>
                <span className="tabular-nums text-[var(--fg-faint)]">{r.skillCount}</span>
              </li>
            ))}
            {roots.length === 0 && <li className="px-2 text-xs text-[var(--fg-faint)]">No skill directories found.</li>}
          </ul>
          {plugins.size > 0 && (
            <details className="group mt-0.5">
              <summary className="flex items-center gap-2 px-2 h-7 rounded-md text-[12px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--fg-faint)] transition-transform group-open:rotate-90" />
                <span className="truncate flex-1">
                  Claude plugins <span className="text-[var(--fg-faint)]">· {plugins.size}</span>
                </span>
                <span className="tabular-nums text-[var(--fg-faint)]">{pluginSkills}</span>
              </summary>
              <ul className="space-y-0.5 pl-3">
                {[...plugins].sort(([a], [b]) => a.localeCompare(b)).map(([name, p]) => (
                  <li key={name} className="flex items-center gap-2 px-2 h-6 text-[12px] text-[var(--fg-muted)]" title={p.paths.join('\n')}>
                    <Puzzle className="h-3 w-3 shrink-0 text-[var(--fg-faint)]" />
                    <span className="truncate flex-1">{name}</span>
                    <span className="tabular-nums text-[var(--fg-faint)]">{p.count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </aside>
  )
}
