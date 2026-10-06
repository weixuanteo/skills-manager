import { BookOpen, ExternalLink, FileWarning, FolderTree, Maximize2, Minimize2, TerminalSquare } from 'lucide-react'
import { Suspense, use, useState, type ReactNode } from 'react'
import type { RemoteRepo, RemoteSkill, Skill } from '@shared/types'
import { splitFrontmatter } from '@shared/frontmatter'
import { api, settle, type FileResult } from '../../lib/api'
import { formatBytes } from '../../lib/format'
import { FileBrowser, type OpenFile } from '../FileBrowser'
import { MarkdownDocument } from '../MarkdownDocument'

type Tab = 'readme' | 'files'

interface Props {
  repo: RemoteRepo
  skill: RemoteSkill
  installed: Skill[]
  focus: boolean
  setFocus: (v: boolean) => void
  /** The install bar, kept under the document like the Commands drawer. */
  footer: ReactNode
}

function Readme({ content, header, onOpenRelative }: { content: Promise<FileResult>; header: ReactNode; onOpenRelative: (p: string) => void }) {
  const { file, error } = use(content)
  if (error) {
    return (
      <div className="p-6">
        <div className="surface p-4 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
          <FileWarning className="h-4 w-4" /> {error}
        </div>
      </div>
    )
  }
  if (!file) return null
  return <MarkdownDocument source={splitFrontmatter(file.content).body} header={header} onOpenRelative={onOpenRelative} />
}

export function RemoteSkillDetail({ repo, skill, installed, focus, setFocus, footer }: Props) {
  const [tab, setTab] = useState<Tab>('readme')
  const base = skill.dir ? skill.dir + '/' : ''
  const load = (p: string) => settle(api.remoteFile(repo, base + p))
  const [readme] = useState(() => load('SKILL.md'))
  const [file, setFile] = useState<OpenFile>(() => ({ path: 'SKILL.md', content: readme }))
  const openFile = (p: string) => setFile({ path: p, content: load(p) })
  const githubUrl = `https://github.com/${repo.owner}/${repo.repo}/tree/${repo.sha}/${skill.dir}`
  const manualOnly = skill.frontmatter['disable-model-invocation'] === true

  const header = (
    <header className="mb-6">
      <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{skill.name}</h1>
      <p className="mt-1.5 text-[15px] text-[var(--fg-muted)] leading-relaxed">{skill.description}</p>
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <span className="chip font-mono">{skill.dir || '/'}</span>
        <span className="chip">
          {skill.fileCount} file{skill.fileCount === 1 ? '' : 's'} · {formatBytes(skill.totalSize)}
        </span>
        {manualOnly && (
          <span className="chip" title="disable-model-invocation: true. The agent only runs it when you call it by name.">
            invoked manually
          </span>
        )}
        {installed.length > 0 && (
          <span className="chip text-emerald-700 dark:text-emerald-300" title={installed.map((s) => s.realPath).join('\n')}>
            installed
          </span>
        )}
      </div>
      {skill.executables.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <TerminalSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Ships {skill.executables.length} executable file{skill.executables.length === 1 ? '' : 's'} ({skill.executables.slice(0, 3).join(', ')}
            {skill.executables.length > 3 ? ', …' : ''}). Read them in Files before installing.
          </span>
        </div>
      )}
    </header>
  )

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'readme', label: 'SKILL.md', icon: <BookOpen className="h-3.5 w-3.5" /> },
    { id: 'files', label: 'Files', icon: <FolderTree className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 @container">
      <div className="h-9 shrink-0 flex items-center gap-0.5 px-1 border-b border-[var(--border)] bg-[var(--bg-elev)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 text-[12.5px] border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-accent-500 text-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            {t.icon}
            {t.label}
            {t.id === 'files' && <span className="text-[var(--fg-faint)] tabular-nums">{skill.fileCount}</span>}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1 min-w-0 text-[11.5px] font-mono text-[var(--fg-faint)] pl-3">
          <span className="truncate hidden @lg:inline">
            {repo.owner}/{repo.repo}@{repo.sha.slice(0, 7)}
          </span>
          <a href={githubUrl} target="_blank" rel="noreferrer noopener" className="btn btn-ghost btn-icon h-7 w-7 text-[var(--fg-faint)]" title="Open on GitHub">
            <ExternalLink className="h-4 w-4" />
          </a>
        </span>
        <button type="button" className="btn btn-ghost btn-icon h-7 w-7 text-[var(--fg-muted)]" onClick={() => setFocus(!focus)} title={focus ? 'Exit reading mode (\\)' : 'Reading mode: hide the list (\\)'}>
          {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-2.5">
        <div className="flex-1 min-h-0 surface overflow-hidden flex flex-col">
          {tab === 'readme' ? (
            <Suspense fallback={<div className="p-6 text-sm text-[var(--fg-muted)]">Loading…</div>}>
              <Readme
                content={readme}
                header={header}
                onOpenRelative={(p) => {
                  openFile(p)
                  setTab('files')
                }}
              />
            </Suspense>
          ) : (
            <FileBrowser files={skill.files} file={file} onSelect={openFile} />
          )}
        </div>
        {footer}
      </div>
    </div>
  )
}
