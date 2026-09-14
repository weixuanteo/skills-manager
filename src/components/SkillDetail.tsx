import { BookOpen, FolderTree, Settings2, FileWarning, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Skill, UpdateStatus } from '@shared/types'
import { api } from '../lib/api'
import { formatBytes, timeAgo, tildify } from '../lib/format'
import { splitFrontmatter } from '@shared/frontmatter'
import { AgentBadge, MethodBadge, ScopeBadge, UpdateBadge } from './Badges'
import { CopyButton } from './CommandBlock'
import { FileBrowser } from './FileBrowser'
import { ManagePanel } from './ManagePanel'
import { MarkdownDocument } from './MarkdownDocument'

export type Tab = 'readme' | 'files' | 'manage'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'readme', label: 'SKILL.md', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'files', label: 'Files', icon: <FolderTree className="h-4 w-4" /> },
  { id: 'manage', label: 'Manage', icon: <Settings2 className="h-4 w-4" /> },
]

/** Compact: pill tabs for the single-row reading-mode header, labels hidden on narrow panes. Otherwise underline tabs. */
function TabBar({ tab, setTab, compact }: { tab: Tab; setTab: (t: Tab) => void; compact?: boolean }) {
  return (
    <nav className={compact ? 'flex items-center gap-0.5' : 'mt-2 -mb-px flex items-center gap-1'}>
      {TABS.map((t) => {
        const active = tab === t.id
        const className = compact
          ? `inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] transition-colors ${
              active ? 'bg-[var(--bg-sunken)] text-[var(--fg)] font-medium' : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-hover)]'
            }`
          : `inline-flex items-center gap-1.5 h-9 px-3 text-sm border-b-2 transition-colors ${
              active ? 'border-accent-500 text-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`
        return (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} title={compact ? t.label : undefined} className={className}>
            {t.icon} {compact ? <span className="hidden @xl:inline">{t.label}</span> : t.label}
          </button>
        )
      })}
    </nav>
  )
}

interface Props {
  skill: Skill
  home: string
  update?: UpdateStatus
  checking: boolean
  onCheck: () => void
  tab: Tab
  setTab: (t: Tab) => void
  /** Reading mode: the list and sidebar are hidden and the header collapses to a single row. */
  focus: boolean
  setFocus: (v: boolean) => void
}

export function SkillDetail({ skill, home, update, checking, onCheck, tab, setTab, focus, setFocus }: Props) {
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

  const fm = readme != null ? splitFrontmatter(readme) : null
  const fmEntries = Object.entries(skill.frontmatter).filter(([k]) => k !== 'name' && k !== 'description')

  const openRelative = (p: string) => {
    setSelectedFile(p)
    setTab('files')
  }

  const updateBadge = <UpdateBadge state={update?.state} loading={checking && !update && skill.install.updateCheckable} />
  const agentBadges = (small?: boolean) => skill.agents.map((a) => <AgentBadge key={a} agent={a} small={small} />)

  return (
    <div className="flex flex-col h-full min-h-0 @container">
      {focus ? (
        <header className="h-11 px-2 border-b border-[var(--border)] shrink-0 flex items-center gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 px-1">
            <h2 className="text-sm font-semibold tracking-tight truncate" title={skill.description}>
              {skill.name}
            </h2>
            {updateBadge}
            <div className="hidden @3xl:flex items-center gap-1.5 min-w-0 overflow-hidden">
              {agentBadges(true)}
              <span className="chip h-5 px-1.5 text-[11px]">{skill.install.label}</span>
            </div>
          </div>
          <TabBar tab={tab} setTab={setTab} compact />
          <button type="button" className="btn btn-ghost btn-icon ml-1" onClick={() => setFocus(false)} title="Exit reading mode (\\)">
            <Minimize2 className="h-4 w-4" />
          </button>
        </header>
      ) : (
        <header className="px-4 @3xl:px-6 pt-4 pb-0 border-b border-[var(--border)] shrink-0">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-semibold tracking-tight truncate">{skill.name}</h2>
                {updateBadge}
              </div>
              {skill.description && <p className="mt-1 text-sm text-[var(--fg-muted)] leading-relaxed max-w-3xl line-clamp-2 @3xl:line-clamp-none">{skill.description}</p>}
              <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                {agentBadges()}
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
            <button type="button" className="btn btn-ghost btn-icon shrink-0 -mr-2 -mt-1 text-[var(--fg-muted)]" onClick={() => setFocus(true)} title="Reading mode: hide the list and filters (\\)">
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
          <TabBar tab={tab} setTab={setTab} />
        </header>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'readme' && (
          <>
            {(readmeError || (readme == null && !readmeError)) && (
              <div className="p-6">
                {readmeError && (
                  <div className="surface p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                    <FileWarning className="h-4 w-4" /> {readmeError}
                  </div>
                )}
                {readme == null && !readmeError && <div className="text-sm text-[var(--fg-muted)]">Loading…</div>}
              </div>
            )}
            {fm && (
              <MarkdownDocument
                source={fm.body}
                onOpenRelative={openRelative}
                header={
                  fm.raw ? (
                    <div className="surface mb-6 overflow-hidden">
                      <button type="button" onClick={() => setShowFm((v) => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
                        <span>Frontmatter{fmEntries.length ? ` · ${fmEntries.map(([k]) => k).join(', ')}` : ''}</span>
                        <span>{showFm ? 'Hide' : 'Show'}</span>
                      </button>
                      {showFm && <pre className="px-4 pb-3 text-[12px] font-mono text-[var(--fg-muted)] overflow-x-auto scroll-thin border-t border-[var(--border)] pt-3">{fm.raw}</pre>}
                    </div>
                  ) : null
                }
              />
            )}
          </>
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
