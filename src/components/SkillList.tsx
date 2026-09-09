import { ChevronRight, TriangleAlert } from 'lucide-react'
import type { Skill, UpdateStatus } from '@shared/types'
import { timeAgo } from '../lib/format'
import { AgentBadge, MethodIcon, UpdateBadge } from './Badges'

interface Props {
  skills: Skill[]
  selectedId: string | null
  onSelect: (id: string) => void
  updates: Record<string, UpdateStatus>
  checking: boolean
}

export function SkillList({ skills, selectedId, onSelect, updates, checking }: Props) {
  if (skills.length === 0)
    return (
      <div className="p-8 text-center text-sm text-[var(--fg-muted)]">
        No skills match the current filters.
      </div>
    )
  return (
    <ul className="p-2 space-y-1">
      {skills.map((s) => {
        const active = s.id === selectedId
        const u = updates[s.id]
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onSelect(s.id)}
              className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors group ${
                active ? 'bg-accent-500/10 border-accent-500/30' : 'border-transparent hover:bg-[var(--bg-hover)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-medium text-sm truncate ${active ? 'text-accent-800 dark:text-accent-100' : ''}`}>{s.name}</span>
                {s.warnings.length > 0 && <TriangleAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="flex-1" />
                {(u || (checking && s.install.updateCheckable)) && <UpdateBadge state={u?.state} loading={checking && !u && s.install.updateCheckable} compact />}
                <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--fg-faint)] transition-transform ${active ? 'translate-x-0.5 text-accent-500' : 'opacity-0 group-hover:opacity-100'}`} />
              </div>
              {s.description && <p className="mt-0.5 text-xs text-[var(--fg-muted)] line-clamp-2 leading-relaxed">{s.description}</p>}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {s.agents.map((a) => (
                  <AgentBadge key={a} agent={a} small />
                ))}
                <span className="chip h-5 px-1.5 text-[11px]">
                  <MethodIcon method={s.install.method} className="h-3 w-3" /> {s.install.label}
                </span>
                <span className="text-[11px] text-[var(--fg-faint)] ml-auto tabular-nums">{timeAgo(s.lastModified)}</span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
