import { ExternalLink, GitBranch, Info, Link2, Package, Terminal, TriangleAlert } from 'lucide-react'
import type { Skill, UpdateStatus } from '@shared/types'
import { tildify } from '../lib/format'
import { MethodBadge, UpdateBadge } from './Badges'
import { CopyButton } from './CommandBlock'

interface Props {
  skill: Skill
  home: string
  update?: UpdateStatus
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-1.5 text-sm">
      <div className="text-[var(--fg-muted)]">{label}</div>
      <div className={`min-w-0 break-all ${mono ? 'font-mono text-[13px]' : ''}`}>{children}</div>
    </div>
  )
}

function httpUrl(remote?: string): string | undefined {
  if (!remote) return undefined
  if (/^https?:\/\//.test(remote)) return remote.replace(/\.git$/, '')
  const m = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/.exec(remote)
  if (m) return `https://${m[1]}/${m[2]}`
  return undefined
}

export function InfoPanel({ skill, home, update }: Props) {
  const { install } = skill
  const git = install.git
  const npm = install.npm
  const cli = install.skillsCli
  const plugin = install.claudePlugin
  const remoteHttp = httpUrl(git?.remoteUrl)

  return (
    <div className="p-6 max-w-4xl space-y-8 fade-in">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Info className="h-4 w-4 text-[var(--fg-muted)]" /> How it was installed
        </h3>
        <div className="border border-[var(--border)] rounded-md bg-[var(--bg)] p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <MethodBadge method={install.method} label={install.label} />
            {update && <UpdateBadge state={update.state} />}
          </div>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{install.summary}</p>
          <div className="divide-y divide-[var(--border)]">
            <Row label="Resolved path" mono>
              <span className="inline-flex items-center gap-1">
                {tildify(skill.realPath, home)} <CopyButton text={skill.realPath} className="h-6 w-6" />
              </span>
            </Row>
            {skill.locations.map((l) => (
              <Row key={l.path} label={l.isSymlink ? 'Linked from' : 'Located at'} mono>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {l.isSymlink && <Link2 className="h-3.5 w-3.5 text-[var(--fg-faint)]" />}
                  {tildify(l.path, home)}
                  <span className="text-[var(--fg-faint)]">· {l.agent} · {l.scope}</span>
                </span>
              </Row>
            ))}
            {git && (
              <>
                <Row label="Git repo" mono>{tildify(git.repoRoot, home)}{git.subPath ? ` / ${git.subPath}` : ''}</Row>
                {git.remoteUrl && (
                  <Row label="Remote" mono>
                    <span className="inline-flex items-center gap-1.5">
                      {git.remoteUrl}
                      {remoteHttp && (
                        <a href={remoteHttp} target="_blank" rel="noreferrer noopener" className="text-accent-600 dark:text-accent-300 hover:underline inline-flex items-center gap-0.5">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </span>
                  </Row>
                )}
                <Row label="Branch / HEAD" mono>
                  {git.branch ?? '?'} @ {git.head?.slice(0, 7)}{git.upstream ? ` (tracks ${git.upstream})` : ''}
                </Row>
              </>
            )}
            {npm && (
              <>
                <Row label="Package" mono>{npm.packageName}{npm.installedVersion ? `@${npm.installedVersion}` : ''}</Row>
                <Row label="Manager">{npm.packageManager}{npm.global ? ' (global)' : npm.projectRoot ? ` in ${tildify(npm.projectRoot, home)}` : ''}</Row>
              </>
            )}
            {cli && (
              <>
                <Row label="Source" mono>{cli.source ?? cli.sourceUrl ?? '—'}{cli.skillPath ? ` (${cli.skillPath})` : ''}</Row>
                <Row label="Lockfile" mono>{tildify(cli.lockfile, home)}</Row>
                {(cli.updatedAt ?? cli.installedAt) && <Row label="Installed">{new Date(cli.updatedAt ?? cli.installedAt!).toLocaleString()}</Row>}
              </>
            )}
            {plugin && (
              <Row label="Plugin" mono>{plugin.plugin}{plugin.marketplace ? `@${plugin.marketplace}` : ''}{plugin.version ? ` v${plugin.version}` : ''}</Row>
            )}
          </div>
        </div>
      </section>

      {(install.method === 'npm' || install.method === 'git-symlink' || install.method === 'git-clone') && (
        <div className="text-xs text-[var(--fg-faint)] flex items-start gap-2">
          {install.method === 'npm' ? <Package className="h-3.5 w-3.5 mt-0.5" /> : <GitBranch className="h-3.5 w-3.5 mt-0.5" />}
          <span>
            {install.method === 'npm'
              ? 'Deleting the directory by hand would leave the package manager’s lockfile out of sync; prefer the uninstall command.'
              : 'Pulling updates only fast-forwards. If the repo has local edits, commit or stash them first.'}
          </span>
        </div>
      )}
      {skill.warnings.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md p-4 text-sm space-y-1">
          <div className="font-medium flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <TriangleAlert className="h-4 w-4" /> Warnings
          </div>
          <ul className="list-disc pl-5 text-[var(--fg-muted)]">
            {skill.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-xs text-[var(--fg-faint)] flex items-center gap-1.5">
        <Terminal className="h-3.5 w-3.5" /> Install method detection is heuristic: it looks at symlinks, node_modules, skills-lock.json, Claude plugin metadata and git metadata.
      </div>
    </div>
  )
}
