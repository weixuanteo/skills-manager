import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { Command } from '@shared/types'

export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return { copied, copy }
}

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const { copied, copy } = useCopy()
  return (
    <button type="button" className={`btn btn-ghost btn-icon shrink-0 ${className}`} onClick={() => copy(text)} title="Copy to clipboard" aria-label="Copy">
      {copied ? <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-4 w-4" />}
    </button>
  )
}

export function CommandBlock({ cmd, recommended }: { cmd: Command; recommended?: boolean }) {
  return (
    <div className={`surface overflow-hidden ${cmd.danger ? 'border-red-500/30' : recommended ? 'border-accent-500/40 ring-1 ring-accent-500/20' : ''}`}>
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{cmd.title}</span>
          {recommended && <span className="chip h-5 px-1.5 text-[11px] border-accent-500/40 bg-accent-500/10 text-accent-700 dark:text-accent-300">Recommended</span>}
          {cmd.danger && (
            <span className="chip h-5 px-1.5 text-[11px] border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
              <TriangleAlert className="h-3 w-3" /> Destructive
            </span>
          )}
        </div>
        <CopyButton text={cmd.command} />
      </div>
      <pre className="px-3 pb-2.5 pt-1 overflow-x-auto text-[13px] leading-relaxed font-mono text-[var(--fg)] scroll-thin">
        <code>{cmd.command}</code>
      </pre>
      {cmd.note && <div className="px-3 pb-2.5 -mt-1 text-xs text-[var(--fg-muted)]">{cmd.note}</div>}
    </div>
  )
}
