import { ArrowUpCircle, CheckCircle2, Loader2, TriangleAlert, XCircle } from 'lucide-react'
import type { Skill, UpdateStatus } from '@shared/types'
import { timeAgo } from '../lib/format'
import { AgentBadge } from './Badges'

interface Props {
  skills: Skill[]
  selectedId: string | null
  onSelect: (id: string) => void
  updates: Record<string, UpdateStatus>
  checking: boolean
  subNames: Map<string, string>
}

function Status({ skill, update, checking }: { skill: Skill; update?: UpdateStatus; checking: boolean }) {
  if (skill.warnings.length)
    return (
      <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400" title={skill.warnings.join('\n')}>
        <TriangleAlert className="h-3.5 w-3.5" />
      </span>
    )
  if (checking && !update && skill.install.updateCheckable) return <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--fg-faint)]" />
  switch (update?.state) {
    case 'update-available':
      return (
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium font-mono" title={update.message}>
          <ArrowUpCircle className="h-3.5 w-3.5" /> {update.latest?.slice(0, 7)}
        </span>
      )
    case 'up-to-date':
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-label="Up to date" />
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-label="Check failed" />
    default:
      return <span className="text-[var(--fg-faint)]">{timeAgo(skill.lastModified)}</span>
  }
}

export function SkillList({ skills, selectedId, onSelect, updates, checking, subNames }: Props) {
  if (skills.length === 0) return <div className="p-8 text-center text-sm text-[var(--fg-muted)]">No skills match the current filters.</div>
  return (
    <ul role="listbox" aria-label="Skills">
      {skills.map((s) => {
        const active = s.id === selectedId
        const sub = subNames.get(s.id)
        return (
          <li key={s.id} role="option" aria-selected={active}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`w-full text-left grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-3 py-[7px] border-l-2 transition-colors ${
                active ? 'bg-accent-500/10 border-accent-500' : 'border-transparent hover:bg-[var(--bg-hover)]'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {s.agents.map((a) => (
                  <AgentBadge key={a} agent={a} small />
                ))}
                <span className={`truncate text-[13px] font-medium ${active ? 'text-accent-800 dark:text-accent-100' : ''}`}>{s.name}</span>
                {sub && <span className="text-[11px] text-[var(--fg-faint)] truncate shrink-0 max-w-[45%]">{sub}</span>}
              </span>
              <span className="text-[11px] tabular-nums whitespace-nowrap">
                <Status skill={s} update={updates[s.id]} checking={checking} />
              </span>
              {s.description && <span className="col-span-2 text-xs text-[var(--fg-muted)] truncate">{s.description}</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
