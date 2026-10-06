import type { AgentId, InstallMethod, Scope, Skill, UpdateState, UpdateStatus } from '@shared/types'

export type Source = 'mine' | 'plugins' | 'builtin'
export type SourceView = Source | 'all'

export const SOURCES: Source[] = ['mine', 'plugins', 'builtin']
export const SOURCE_LABELS: Record<SourceView, string> = { mine: 'Mine', plugins: 'Plugins', builtin: 'Built-in', all: 'All' }

/** Plugin skills linked into a directory the user manages count as theirs. */
export function skillSource(s: Skill): Source {
  if (s.install.method === 'codex-system') return 'builtin'
  if (s.install.method === 'claude-plugin' && s.locations.every((l) => l.agent === 'claude-plugin')) return 'plugins'
  return 'mine'
}

/** Source already says a skill came from a plugin, so the agent facet files it under Claude Code. */
export const facetAgents = (s: Skill): AgentId[] => [...new Set(s.agents.map((a) => (a === 'claude-plugin' ? 'claude' : a)))]

/** Methods the source selector already covers. */
export const SOURCE_METHODS = new Set<InstallMethod>(['claude-plugin', 'codex-system'])

export const needsAttention = (s: Skill, u?: UpdateStatus) => s.warnings.length > 0 || u?.state === 'update-available' || u?.state === 'error'

export interface Facets {
  agents: Set<AgentId>
  scopes: Set<Scope>
  methods: Set<InstallMethod>
  updates: Set<UpdateState>
  attention: boolean
}

export const emptyFacets = (): Facets => ({ agents: new Set(), scopes: new Set(), methods: new Set(), updates: new Set(), attention: false })

/** Sidebar refinements only; attention is toggled from the list header. */
export const facetCount = (f: Facets) => f.agents.size + f.scopes.size + f.methods.size + f.updates.size

export type Dim = 'source' | 'agents' | 'scopes' | 'methods' | 'updates' | 'attention'

/** Every dimension the skill fails, so counts can drop exactly the dimension being counted. */
export function failedDims(s: Skill, source: SourceView, f: Facets, u?: UpdateStatus): Dim[] {
  const out: Dim[] = []
  if (source !== 'all' && skillSource(s) !== source) out.push('source')
  if (f.agents.size && !facetAgents(s).some((a) => f.agents.has(a))) out.push('agents')
  if (f.scopes.size && !s.scopes.some((x) => f.scopes.has(x))) out.push('scopes')
  if (f.methods.size && !f.methods.has(s.install.method)) out.push('methods')
  if (f.updates.size && !(u && f.updates.has(u.state))) out.push('updates')
  if (f.attention && !needsAttention(s, u)) out.push('attention')
  return out
}

export function matchesQuery(s: Skill, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = `${s.name} ${s.description ?? ''} ${s.realPath} ${s.locations.map((l) => l.path).join(' ')} ${s.install.label} ${s.install.claudePlugin?.plugin ?? ''}`.toLowerCase()
  return q.split(/\s+/).every((part) => hay.includes(part))
}
