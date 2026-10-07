import { Check, ChevronDown, ChevronUp, Copy, Loader2, Play, RefreshCw, Terminal, Trash2, TriangleAlert } from 'lucide-react'
import { type ComponentProps, useState } from 'react'
import type { Command, Skill, UpdateStatus } from '@shared/types'
import { usePersistedBool } from '../hooks/usePersisted'
import { useCopy } from './CommandBlock'
import { ConfirmDialog } from './ConfirmDialog'

const OPEN_KEY = 'sm-commands'

interface Props {
  skill: Skill
  update?: UpdateStatus
  checking: boolean
  onCheck: () => void
  busy: boolean
  onRun: (cmd: Command) => void
}

function stateText(skill: Skill, update: UpdateStatus | undefined, checking: boolean): { text: string; className: string } {
  if (checking && !update) return { text: 'checking…', className: 'text-[var(--fg-muted)]' }
  switch (update?.state) {
    case 'update-available':
      return { text: `${update.latest ?? 'update'} available`, className: 'text-amber-700 dark:text-amber-400 font-medium' }
    case 'up-to-date':
      return { text: 'up to date', className: 'text-emerald-700 dark:text-emerald-400' }
    case 'local-ahead':
      return { text: 'local ahead of remote', className: 'text-sky-700 dark:text-sky-400' }
    case 'error':
      return { text: 'check failed', className: 'text-red-700 dark:text-red-400' }
    default:
      return { text: skill.install.updateCheckable && update?.state !== 'unsupported' ? 'not checked' : 'not checkable', className: 'text-[var(--fg-faint)]' }
  }
}

function CopyLabel({ text }: { text: string }) {
  const { copied, copy } = useCopy()
  return (
    <button type="button" className="btn btn-ghost h-7 px-2 text-xs shrink-0" onClick={() => copy(text)} title="Copy to clipboard">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Row({ cmd, recommended, busy, onRun }: { cmd: Command; recommended?: boolean; busy: boolean; onRun: (cmd: Command) => void }) {
  return (
    <div className="grid grid-cols-[200px_minmax(0,1fr)_auto_auto] items-center gap-3 py-1.5 border-b border-[var(--border)] last:border-b-0">
      <div className={`text-[12.5px] leading-tight min-w-0 ${cmd.danger ? 'text-red-700 dark:text-red-400' : ''}`}>
        <div className="flex items-center gap-1.5">
          {cmd.danger && <TriangleAlert className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate" title={cmd.title}>{cmd.title}</span>
        </div>
        {recommended && <div className="text-[11px] text-accent-600 dark:text-accent-300">recommended</div>}
        {cmd.note && <div className="text-[11px] text-[var(--fg-faint)] line-clamp-2">{cmd.note}</div>}
      </div>
      <code className="block truncate font-mono text-xs bg-[var(--bg-sunken)] text-[var(--fg)] px-2 py-1.5 rounded" title={cmd.command}>
        {cmd.command}
      </code>
      <CopyLabel text={cmd.command} />
      <button type="button" className="btn btn-ghost h-7 px-2 text-xs shrink-0" onClick={() => onRun(cmd)} disabled={busy} title="Run this command on this machine">
        <Play className="h-3.5 w-3.5" /> Run
      </button>
    </div>
  )
}

type Confirm = Pick<ComponentProps<typeof ConfirmDialog>, 'title' | 'verb' | 'options' | 'danger'>

export function CommandsDrawer({ skill, update, checking, onCheck, busy, onRun }: Props) {
  const [open, setOpen] = usePersistedBool(OPEN_KEY, false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const { install } = skill
  const commands = [...install.updateCommands, ...install.removeCommands]
  const st = stateText(skill, update, checking)

  return (
    <section className="surface shrink-0 flex flex-col min-h-0 max-h-[260px]" aria-label="Commands">
      <div className="flex items-center gap-2.5 h-9 px-3 text-xs shrink-0">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2.5 flex-1 min-w-0 h-full text-left cursor-pointer">
          <Terminal className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
          <span className="font-semibold">Commands</span>
          <span className={st.className}>{st.text}</span>
          {update?.current && update.latest && update.latest !== update.current && (
            <span className="font-mono text-[11px] text-[var(--fg-faint)] hidden @2xl:inline">
              {update.current} → {update.latest}
            </span>
          )}
          <span className="text-[var(--fg-faint)] tabular-nums hidden @xl:inline">{commands.length} command{commands.length === 1 ? '' : 's'}</span>
          <span className="ml-auto text-[var(--fg-muted)]">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</span>
        </button>
        {install.updateCheckable && (
          <button type="button" className="btn btn-ghost h-7 px-2 text-xs text-[var(--fg-muted)]" onClick={onCheck} disabled={checking} title={install.updateCheckHint}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {checking ? 'Checking…' : 'Check now'}
          </button>
        )}
        {install.removeCommands.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost h-7 px-2 text-xs text-[var(--fg-muted)] hover:text-red-700 dark:hover:text-red-400"
            onClick={() => setConfirm({ title: `Remove ${skill.name}?`, verb: 'Remove', options: install.removeCommands, danger: true })}
            disabled={busy}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-1 overflow-y-auto scroll-thin min-h-0">
          {update?.message && <p className="text-[11.5px] text-[var(--fg-muted)] py-1.5 border-b border-[var(--border)]">{update.message}</p>}
          {commands.map((c) => (
            <Row
              key={c.command}
              cmd={c}
              recommended={c === install.updateCommands[0] && update?.state === 'update-available'}
              busy={busy}
              onRun={(cmd) => setConfirm({ title: `${cmd.title}?`, verb: 'Run', options: [cmd], danger: install.removeCommands.includes(cmd) })}
            />
          ))}
          {commands.length === 0 && <p className="text-xs text-[var(--fg-faint)] py-2">No update or remove command for this install method.</p>}
          <p className="text-[11px] text-[var(--fg-faint)] py-1.5">Copy a command into a terminal, or run it here after confirming.</p>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={(cmd) => {
            setConfirm(null)
            onRun(cmd)
          }}
        />
      )}
    </section>
  )
}
