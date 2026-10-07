import { ArrowUpCircle, Download, History, Trash2, TriangleAlert, XCircle, type LucideIcon } from 'lucide-react'
import { use, useState } from 'react'
import type { LogEntry } from '@shared/types'
import type { LogResult } from '../lib/api'
import { timeAgo, tildify } from '../lib/format'
import { CopyButton } from './CommandBlock'

const KIND_ICONS: Record<LogEntry['kind'], LucideIcon> = { install: Download, update: ArrowUpCircle, remove: Trash2 }

interface Props {
  promise: Promise<LogResult>
  home: string
  focus: boolean
}

/** Every install, update and remove the app has run: the list on the left, the selected run's command and output on the right. */
export function CommandLog({ promise, home, focus }: Props) {
  const { log, error } = use(promise)
  const entries = log?.entries ?? []
  const [chosenId, setChosenId] = useState<string | null>(null)
  const selected = entries.find((e) => e.id === chosenId) ?? entries[0]

  return (
    <div className="flex-1 flex min-h-0">
      {!focus && (
        <div className="w-[300px] 2xl:w-[340px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-elev)] flex flex-col min-h-0">
          <div className="px-3 pt-2.5 pb-2 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold">
              Command log
              <span className="ml-auto text-[11px] font-normal text-[var(--fg-faint)] tabular-nums">
                {entries.length} run{entries.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
            <ul role="listbox" aria-label="Runs">
              {entries.map((e) => {
                const active = e.id === selected?.id
                const Icon = KIND_ICONS[e.kind]
                return (
                  <li key={e.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onClick={() => setChosenId(e.id)}
                      className={`w-full text-left grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-3 py-[7px] border-l-2 transition-colors ${
                        active ? 'bg-accent-500/10 border-accent-500' : 'border-transparent hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
                      <span className={`truncate text-[13px] font-medium ${active ? 'text-accent-800 dark:text-accent-100' : ''}`}>{e.skills.join(', ')}</span>
                      <span className="flex items-center gap-1 text-[11px] tabular-nums whitespace-nowrap text-[var(--fg-faint)]" title={new Date(e.startedAt).toLocaleString()}>
                        {!e.ok && <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" aria-label="Failed" />}
                        {timeAgo(e.startedAt)}
                      </span>
                      <span className="col-start-2 col-span-2 text-xs text-[var(--fg-muted)] truncate">{e.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {log && (
            <div className="px-3 py-2 border-t border-[var(--border)] text-[11px] font-mono text-[var(--fg-faint)] truncate shrink-0" title={log.file}>
              {tildify(log.file, home)}
            </div>
          )}
        </div>
      )}
      <main className="flex-1 min-w-0 min-h-0 bg-[var(--bg)] p-2.5 flex flex-col">
        {error ? (
          <div className="surface p-3 text-sm text-red-600 dark:text-red-400 flex items-start gap-2">
            <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" /> {error}
          </div>
        ) : selected ? (
          <Entry key={selected.id} entry={selected} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[var(--fg-faint)] gap-3 px-6 text-center">
            <History className="h-10 w-10" />
            <div className="text-sm max-w-md">Nothing has run yet. Installs, updates and removes started here are listed with their command and output.</div>
          </div>
        )}
      </main>
    </div>
  )
}

function Entry({ entry }: { entry: LogEntry }) {
  const Icon = KIND_ICONS[entry.kind]
  return (
    <div className="flex-1 min-h-0 surface overflow-y-auto scroll-thin">
      <div className="p-6 max-w-4xl space-y-6 fade-in">
        <header>
          <div className="flex items-center gap-2 flex-wrap">
            <Icon className="h-4 w-4 text-[var(--fg-muted)]" />
            <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{entry.skills.join(', ')}</h1>
            {entry.ok ? (
              <span className="chip border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Succeeded</span>
            ) : (
              <span className="chip border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300">Failed</span>
            )}
          </div>
          <p className="mt-1.5 text-[15px] text-[var(--fg-muted)]">{entry.title}</p>
          <p className="mt-1 text-xs text-[var(--fg-faint)] tabular-nums">
            {new Date(entry.startedAt).toLocaleString()} · took {entry.durationMs < 1000 ? `${entry.durationMs} ms` : `${(entry.durationMs / 1000).toFixed(1)} s`}
          </p>
        </header>
        <Block label="Command" text={entry.command} />
        <Block label="Output" text={entry.output} />
      </div>
    </div>
  )
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-semibold">{label}</h2>
        <CopyButton text={text} className="h-7 w-7 text-[var(--fg-muted)]" />
      </div>
      <pre className="rounded-md border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-words">{text}</pre>
    </section>
  )
}
