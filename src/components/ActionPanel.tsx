import { CheckCircle2, ChevronDown, ChevronUp, History, Loader2, X, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { ActionResult } from '@shared/types'
import { CopyButton } from './CommandBlock'

export interface ActionState {
  label: string
  /** What is being run, one command per line. */
  command: string
  running: boolean
  result?: ActionResult
  error?: string
}

/** The command the app is running, then its output; pinned to the top right so it never covers the drawers below. */
export function ActionPanel({ action, onClose, onOpenLog }: { action: ActionState; onClose: () => void; onOpenLog?: () => void }) {
  const failed = !action.running && (!!action.error || action.result?.ok === false)
  const [open, setOpen] = useState(failed)
  const output = action.error ?? action.result?.output ?? ''
  const shown = action.running ? action.command.replace(/^/gm, '$ ') : open || failed ? output : ''

  return (
    <section className="absolute top-11 right-3 z-30 w-[min(640px,calc(100%-1.5rem))] surface shadow-xl flex flex-col max-h-[50%] fade-in" aria-live="polite" aria-label="Command output">
      <div className="flex items-center gap-2 h-9 px-3 text-xs shrink-0">
        {action.running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--fg-muted)]" />
        ) : failed ? (
          <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        )}
        <span className="font-semibold truncate">{action.label}</span>
        <span className="text-[var(--fg-muted)]">{action.running ? 'running…' : failed ? 'failed' : 'done'}</span>
        <span className="flex-1" />
        {output && !failed && (
          <button type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Output
          </button>
        )}
        {output && <CopyButton text={output} className="h-7 w-7" />}
        {!action.running && onOpenLog && (
          <button type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={onOpenLog} title="Every command the app has run">
            <History className="h-3.5 w-3.5" /> Log
          </button>
        )}
        {!action.running && (
          <button type="button" className="btn btn-ghost btn-icon h-7 w-7" onClick={onClose} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {shown && (
        <pre className="border-t border-[var(--border)] px-3 py-2 text-[11.5px] font-mono leading-relaxed whitespace-pre-wrap break-all overflow-y-auto scroll-thin min-h-0 bg-[var(--bg-sunken)] rounded-b-lg">
          {shown}
        </pre>
      )}
    </section>
  )
}
