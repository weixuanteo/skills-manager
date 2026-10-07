import { Download, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { INSTALL_AGENTS } from '@shared/agents'
import type { AgentId, InstallRequest, InstallScope, RemoteRepo, ScanResult } from '@shared/types'
import { api } from '../../lib/api'
import { tildify } from '../../lib/format'
import { ConfirmDialog } from '../ConfirmDialog'

const AGENTS_KEY = 'sm-install-agents'
const SCOPE_KEY = 'sm-install-scope'

interface Props {
  repo: RemoteRepo
  /** Directories of the picked skills, in list order. */
  picked: string[]
  /** Installed when nothing is picked, so the skill on screen is one click away. */
  previewDir: string
  scan: ScanResult
  busy: boolean
  onInstall: (req: InstallRequest, label: string, command: string) => void
}

/** Agents with a global skills directory on this machine; Claude Code if there are none. */
function defaultAgents(scan: ScanResult): AgentId[] {
  const present = new Set(scan.roots.filter((r) => r.exists && r.scope === 'global').map((r) => r.agent))
  const ids = INSTALL_AGENTS.filter((a) => present.has(a.id)).map((a) => a.id)
  return ids.length ? ids : ['claude']
}

function storedAgents(scan: ScanResult): AgentId[] {
  try {
    const v = JSON.parse(localStorage.getItem(AGENTS_KEY) ?? 'null') as unknown
    if (Array.isArray(v)) return v.filter((a): a is AgentId => INSTALL_AGENTS.some((x) => x.id === a))
  } catch {
    // Fall through to the detected agents.
  }
  return defaultAgents(scan)
}

export function InstallBar({ repo, picked: ticked, previewDir, scan, busy, onInstall }: Props) {
  const picked = ticked.length ? ticked : [previewDir]
  const [agents, setAgentsState] = useState(() => storedAgents(scan))
  const [showAll, setShowAll] = useState(false)
  const [scopeKey, setScopeKeyState] = useState(() => {
    const stored = localStorage.getItem(SCOPE_KEY)
    return stored && scan.projectRoots.includes(stored) ? stored : 'global'
  })
  const [prepared, setPrepared] = useState<{ command: string; req: InstallRequest; label: string; key: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)

  const setAgents = (next: AgentId[]) => {
    setAgentsState(next)
    localStorage.setItem(AGENTS_KEY, JSON.stringify(next))
  }
  const present = new Set(defaultAgents(scan))
  const visible = INSTALL_AGENTS.filter((a) => showAll || present.has(a.id) || agents.includes(a.id))
  const scope: InstallScope = scopeKey === 'global' ? { kind: 'global' } : { kind: 'project', path: scopeKey }
  const names = repo.skills.filter((s) => picked.includes(s.dir)).map((s) => s.name)
  // A dry run that returns after the picks, agents or scope changed is for a different install.
  const key = [...picked, ...agents, scopeKey].join('\n')
  const confirm = prepared?.key === key ? prepared : null

  const prepare = async () => {
    const req: InstallRequest = { owner: repo.owner, repo: repo.repo, ref: repo.ref, sha: repo.sha, dirs: picked, agents, scope }
    const label = `Install ${names.length === 1 ? names[0] : `${names.length} skills`}`
    setPreparing(true)
    setError(null)
    try {
      setPrepared({ command: (await api.install(req, true)).command, req, label, key })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPreparing(false)
    }
  }

  return (
    <section className="surface shrink-0 flex flex-col text-xs" aria-label="Install">
      <div className="flex items-center gap-2.5 min-h-9 px-3 py-1.5 flex-wrap">
        <Download className="h-3.5 w-3.5 text-[var(--fg-muted)]" />
        <span className="font-semibold">Install</span>
        <span className="truncate max-w-[40%]" title={names.join(', ')}>
          {ticked.length ? `${names.length} selected: ${names.join(', ')}` : names[0]}
        </span>
        {!ticked.length && <span className="text-[var(--fg-faint)] truncate hidden @3xl:inline">tick more in the list to install several</span>}
        <span className="flex-1" />
        <span className="text-[var(--fg-faint)]">for</span>
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Agents">
          {visible.map((a) => {
            const on = agents.includes(a.id)
            return (
              <button key={a.id} type="button" aria-pressed={on} className={`qchip ${on ? 'on' : ''}`} onClick={() => setAgents(on ? agents.filter((x) => x !== a.id) : [...agents, a.id])}>
                {a.label}
              </button>
            )
          })}
          {!showAll && visible.length < INSTALL_AGENTS.length && (
            <button type="button" className="qchip border-dashed" onClick={() => setShowAll(true)}>
              more…
            </button>
          )}
        </div>
        <select
          value={scopeKey}
          onChange={(e) => {
            setScopeKeyState(e.target.value)
            localStorage.setItem(SCOPE_KEY, e.target.value)
          }}
          aria-label="Install scope"
          className="h-[22px] rounded border border-[var(--border)] bg-[var(--bg)] px-1 text-[11.5px] max-w-[200px]"
        >
          <option value="global">Global (~)</option>
          {scan.projectRoots.map((p) => (
            <option key={p} value={p}>
              Project: {tildify(p, scan.home)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-primary h-7 px-2.5 text-xs" disabled={!agents.length || busy || preparing} onClick={prepare}>
          {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Install{picked.length > 1 ? ` ${picked.length}` : ''}
        </button>
      </div>
      {error && <p className="border-t border-[var(--border)] px-3 py-1.5 text-red-600 dark:text-red-400">{error}</p>}
      {confirm && (
        <ConfirmDialog
          title={`${confirm.label}?`}
          verb="Install"
          options={[{ title: confirm.label, command: confirm.command }]}
          busy={busy}
          onClose={() => setPrepared(null)}
          onConfirm={() => {
            setPrepared(null)
            onInstall(confirm.req, confirm.label, confirm.command)
          }}
        />
      )}
    </section>
  )
}
