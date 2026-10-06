import { FolderOpen, Loader2, Plus, Trash2, X } from 'lucide-react'
import { Suspense, use, useState } from 'react'
import { api } from '../lib/api'
import { focusOnMount } from '../lib/dom'
import { tildify } from '../lib/format'

interface Props {
  onClose: () => void
  onSaved: () => void
  home: string
}

type Config = Awaited<ReturnType<typeof api.config>>
type ConfigResult = { config: Config; error?: undefined } | { config?: undefined; error: string }

const loadConfig = (): Promise<ConfigResult> =>
  api.config().then(
    (config) => ({ config }),
    (e: Error) => ({ error: e.message }),
  )

function RootsForm({ config, onClose, onSaved, home }: { config: Config } & Props) {
  const [roots, setRoots] = useState(config.projectRoots)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const v = draft.trim()
    if (!v) return
    if (!roots.includes(v)) setRoots([...roots, v])
    setDraft('')
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await api.saveConfig(roots)
      if (res.invalid.length) setError(`Not a directory: ${res.invalid.join(', ')}`)
      setRoots(res.projectRoots)
      onSaved()
      if (!res.invalid.length) onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="p-5 space-y-4">
        <p className="text-sm text-[var(--fg-muted)]">
          Your home directory is always scanned. Add project folders here to also pick up their <code className="font-mono text-xs">.agents/skills</code>, <code className="font-mono text-xs">.claude/skills</code>, <code className="font-mono text-xs">.github/skills</code> and similar directories.
        </p>
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="~/Code/my-project"
            className="flex-1 h-9 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-sm font-mono placeholder:text-[var(--fg-faint)] focus:border-accent-500/60"
          />
          <button type="button" className="btn" onClick={add} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
          {config.envRoots.map((r) => (
            <li key={'env' + r} className="flex items-center gap-2 px-3 h-9 text-sm bg-[var(--bg-sunken)]">
              <span className="font-mono text-[13px] truncate flex-1">{tildify(r, home)}</span>
              <span className="chip h-5 text-[10px]">SKILLS_MANAGER_ROOTS</span>
            </li>
          ))}
          {roots.map((r) => (
            <li key={r} className="flex items-center gap-2 px-3 h-9 text-sm">
              <span className="font-mono text-[13px] truncate flex-1">{tildify(r, home)}</span>
              <button type="button" className="btn btn-ghost h-7 w-7 px-0 justify-center text-[var(--fg-muted)] hover:text-red-600" onClick={() => setRoots(roots.filter((x) => x !== r))} aria-label="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {roots.length === 0 && config.envRoots.length === 0 && <li className="px-3 h-9 flex items-center text-sm text-[var(--fg-faint)]">No project folders yet.</li>}
        </ul>
        {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
        {config.configFile && <div className="text-[11px] text-[var(--fg-faint)] font-mono">Saved to {tildify(config.configFile, home)}</div>}
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save & rescan
        </button>
      </div>
    </>
  )
}

function Loaded({ promise, ...props }: { promise: Promise<ConfigResult> } & Props) {
  const r = use(promise)
  if (r.error !== undefined) return <div className="p-5 text-sm text-red-600 dark:text-red-400">{r.error}</div>
  return <RootsForm config={r.config} {...props} />
}

/** Mounted only while open, so the config is fetched fresh each time. */
export function ProjectRootsDialog(props: Props) {
  const [promise] = useState(loadConfig)
  return (
    <div
      ref={focusOnMount}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      tabIndex={-1}
      onClick={props.onClose}
      onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
    >
      <div className="surface w-full max-w-lg shadow-2xl fade-in" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-accent-500" /> Project folders to scan
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={props.onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <Suspense
          fallback={
            <div className="p-5 text-sm text-[var(--fg-muted)] flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          }
        >
          <Loaded promise={promise} {...props} />
        </Suspense>
      </div>
    </div>
  )
}
