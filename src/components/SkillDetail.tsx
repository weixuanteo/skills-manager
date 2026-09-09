import { BookOpen, FolderTree, Settings2, FileWarning } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Skill, UpdateStatus } from '@shared/types'
import { api } from '../lib/api'
import { formatBytes, timeAgo, tildify } from '../lib/format'
import { parseFrontmatterClient } from '../lib/frontmatter'
import { AgentBadge, MethodBadge, ScopeBadge, UpdateBadge } from './Badges'
import { CopyButton } from './CommandBlock'
import { FileBrowser } from './FileBrowser'
import { ManagePanel } from './ManagePanel'
import { Markdown } from './Markdown'

export type Tab = 'readme' | 'files' | 'manage'

interface Props {
  skill: Skill
  home: string
  update?: UpdateStatus
  checking: boolean
  onCheck: () => void
  tab: Tab
  setTab: (t: Tab) => void
}

export function SkillDetail({ skill, home, update, checking, onCheck, tab, setTab }: Props) {
  const [readme, setReadme] = useState<string | null>(null)
  const [readmeError, setReadmeError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState('SKILL.md')
  const [showFm, setShowFm] = useState(false)

  useEffect(() => {
    let cancelled = false
    setReadme(null)
    setReadmeError(null)
    setSelectedFile(skill.skillFile.slice(skill.realPath.length + 1) || 'SKILL.md')
    api
      .file(skill.id, skill.skillFile.slice(skill.realPath.length + 1) || 'SKILL.md')
      .then((f) => !cancelled && setReadme(f.content))
      .catch((e: Error) => !cancelled && setReadmeError(e.message))
    return () => {
      cancelled = true
    }
  }, [skill.id, skill.realPath, skill.skillFile])

  const fm = readme != null ? parseFrontmatterClient(readme) : null
  const fmEntries = Object.entries(skill.frontmatter).filter(([k]) => k !== 'name' && k !== 'description')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'readme', label: 'SKILL.md', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'files', label: `Files`, icon: <FolderTree className="h-4 w-4" /> },
    { id: 'manage', label: 'Manage', icon: <Settings2 className="h-4 w-4" /> },
  ]

  const openRelative = (p: string) => {
    setSelectedFile(p)
    setTab('files')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="px-6 pt-5 pb-0 border-b border-[var(--border)] shrink-0">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold tracking-tight truncate">{skill.name}</h2>
              <UpdateBadge state={update?.state} loading={checking && !update && skill.install.updateCheckable} />
            </div>
            {skill.description && <p className="mt-1 text-sm text-[var(--fg-muted)] leading-relaxed max-w-3xl">{skill.description}</p>}
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              {skill.agents.map((a) => (
                <AgentBadge key={a} agent={a} />
              ))}
              {skill.scopes.map((s) => (
                <ScopeBadge key={s} scope={s} />
              ))}
              <MethodBadge method={skill.install.method} label={skill.install.label} />
              <span className="chip">{skill.fileCount} files · {formatBytes(skill.totalSize)}</span>
              <span className="chip" title={new Date(skill.lastModified).toLocaleString()}>updated {timeAgo(skill.lastModified)}</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-xs text-[var(--fg-faint)] font-mono min-w-0">
              <span className="truncate">{tildify(skill.realPath, home)}</span>
              <CopyButton text={skill.realPath} className="h-6 w-6" />
            </div>
          </div>
        </div>
        <nav className="mt-3 -mb-px flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-sm border-b-2 transition-colors ${
                tab === t.id ? 'border-accent-500 text-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'readme' && (
          <div className="h-full overflow-y-auto scroll-thin">
            <div className="p-6 max-w-4xl">
              {readmeError && (
                <div className="surface p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <FileWarning className="h-4 w-4" /> {readmeError}
                </div>
              )}
              {readme == null && !readmeError && <div className="text-sm text-[var(--fg-muted)]">Loading…</div>}
              {fm && (
                <div className="fade-in">
                  {fm.raw && (
                    <div className="surface mb-6 overflow-hidden">
                      <button type="button" onClick={() => setShowFm((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
                        <span>Frontmatter{fmEntries.length ? ` · ${fmEntries.map(([k]) => k).join(', ')}` : ''}</span>
                        <span>{showFm ? 'Hide' : 'Show'}</span>
                      </button>
                      {showFm && <pre className="px-4 pb-3 text-[12px] font-mono text-[var(--fg-muted)] overflow-x-auto scroll-thin border-t border-[var(--border)] pt-3">{fm.raw}</pre>}
                    </div>
                  )}
                  <Markdown source={fm.body} onOpenRelative={openRelative} />
                </div>
              )}
            </div>
          </div>
        )}
        {tab === 'files' && <FileBrowser skill={skill} selected={selectedFile} onSelect={setSelectedFile} />}
        {tab === 'manage' && (
          <div className="h-full overflow-y-auto scroll-thin">
            <ManagePanel skill={skill} home={home} update={update} checking={checking} onCheck={onCheck} />
          </div>
        )}
      </div>
    </div>
  )
}
