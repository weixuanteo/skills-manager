import type { AgentId, InstallMethod, UpdateState } from '@shared/types'
import { AGENT_COLORS, AGENT_LABELS, METHOD_LABELS, UPDATE_COLORS, UPDATE_LABELS } from '../lib/format'
import { ArrowUpCircle, CheckCircle2, CircleDashed, CircleHelp, GitBranch, Package, Puzzle, Link2, FolderOpen, Terminal, Sparkles, XCircle, Loader2, Folder, type LucideIcon } from 'lucide-react'
import { brandIconFor } from './BrandIcons'

const UPDATE_ICONS: Record<UpdateState, LucideIcon> = {
  'up-to-date': CheckCircle2,
  'update-available': ArrowUpCircle,
  'local-ahead': ArrowUpCircle,
  error: XCircle,
  unsupported: CircleDashed,
  unknown: CircleHelp,
}

export function AgentBadge({ agent, small }: { agent: AgentId; small?: boolean }) {
  const label = AGENT_LABELS[agent] ?? agent
  const Icon = brandIconFor(agent)
  if (Icon) {
    return (
      <span
        className={`chip border ${AGENT_COLORS[agent]} ${small ? 'h-5 w-5 justify-center px-0' : 'gap-2 pl-2'}`}
        title={label}
        aria-label={label}
        role="img"
      >
        <Icon className={small ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {!small && label}
      </span>
    )
  }
  return (
    <span className={`chip border ${AGENT_COLORS[agent]} ${small ? 'h-5 px-1.5 text-[11px]' : ''}`}>
      {label}
    </span>
  )
}

export function MethodIcon({ method, className = 'h-3.5 w-3.5' }: { method: InstallMethod; className?: string }) {
  switch (method) {
    case 'npm':
      return <Package className={className} />
    case 'skills-cli':
      return <Terminal className={className} />
    case 'claude-plugin':
      return <Puzzle className={className} />
    case 'codex-system':
      return <Sparkles className={className} />
    case 'git-clone':
    case 'git-symlink':
      return <GitBranch className={className} />
    case 'symlink':
      return <Link2 className={className} />
    default:
      return <FolderOpen className={className} />
  }
}

export function MethodBadge({ method, label }: { method: InstallMethod; label?: string }) {
  return (
    <span className="chip">
      <MethodIcon method={method} />
      {label ?? METHOD_LABELS[method]}
    </span>
  )
}

export function UpdateBadge({ state, loading, compact }: { state?: UpdateState; loading?: boolean; compact?: boolean }) {
  if (loading)
    return (
      <span className="chip">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {!compact && 'Checking…'}
      </span>
    )
  if (!state) return null
  const Icon = UPDATE_ICONS[state]
  return (
    <span className={`chip border ${UPDATE_COLORS[state]}`} title={UPDATE_LABELS[state]}>
      <Icon className="h-3.5 w-3.5" /> {!compact && UPDATE_LABELS[state]}
    </span>
  )
}

export function ScopeBadge({ scope }: { scope: 'global' | 'project' }) {
  return (
    <span className="chip">
      <Folder className="h-3.5 w-3.5" /> {scope}
    </span>
  )
}
