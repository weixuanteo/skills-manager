import { BookOpen, FileWarning, FolderTree, Info, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import { Suspense, use, useState, useTransition } from 'react'
import type { Command, Skill, UpdateStatus } from '@shared/types'
import { loadFile, type FileResult } from '../lib/api'
import { formatBytes, timeAgo, tildify } from '../lib/format'
import { splitFrontmatter } from '@shared/frontmatter'
import { AgentBadge, MethodBadge, ScopeBadge, UpdateBadge } from './Badges'
import { CopyButton } from './CommandBlock'
import { CommandsDrawer } from './CommandsDrawer'
import { FileBrowser, type OpenFile } from './FileBrowser'
import { InfoPanel } from './InfoPanel'
import { MarkdownDocument } from './MarkdownDocument'

export type Tab = 'readme' | 'files' | 'info'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'readme', label: 'SKILL.md', icon: <BookOpen className="h-3.5 w-3.5" /> },
  { id: 'files', label: 'Files', icon: <FolderTree className="h-3.5 w-3.5" /> },
  { id: 'info', label: 'Info', icon: <Info className="h-3.5 w-3.5" /> },
]

interface Props {
  skill: Skill
  home: string
  update?: UpdateStatus
  checking: boolean
  onCheck: () => void
  tab: Tab
  setTab: (t: Tab) => void
  focus: boolean
  setFocus: (v: boolean) => void
  busy: boolean
  onRun: (cmd: Command) => void
}

function DocHeader({ skill, update, checking }: { skill: Skill; update?: UpdateStatus; checking: boolean }) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[22px] font-semibold tracking-tight leading-tight">{skill.name}</h1>
        <UpdateBadge state={update?.state} loading={checking && !update && skill.install.updateCheckable} />
      </div>
      {skill.description && <p className="mt-1.5 text-[15px] text-[var(--fg-muted)] leading-relaxed">{skill.description}</p>}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {skill.agents.map((a) => (
          <AgentBadge key={a} agent={a} />
        ))}
        {skill.scopes.map((s) => (
          <ScopeBadge key={s} scope={s} />
        ))}
        <MethodBadge method={skill.install.method} label={skill.install.label} />
        <span className="chip">
          {skill.fileCount} file{skill.fileCount === 1 ? '' : 's'} · {formatBytes(skill.totalSize)}
        </span>
        <span className="chip" title={new Date(skill.lastModified).toLocaleString()}>
          updated {timeAgo(skill.lastModified)}
        </span>
      </div>
      {skill.warnings.length > 0 && (
        <div className="mt-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-1.5">
          <FileWarning className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{skill.warnings.join(' ')}</span>
        </div>
      )}
    </header>
  )
}

function Readme({ content, frontmatter, header, onOpenRelative }: { content: Promise<FileResult>; frontmatter: Skill['frontmatter']; header: React.ReactNode; onOpenRelative: (p: string) => void }) {
  const [showFm, setShowFm] = useState(false)
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
  const fm = splitFrontmatter(file.content)
  const fmKeys = Object.keys(frontmatter).filter((k) => k !== 'name' && k !== 'description')
  return (
    <MarkdownDocument
      source={fm.body}
      onOpenRelative={onOpenRelative}
      header={
        <>
          {header}
          {fm.raw && (
            <div className="border border-[var(--border)] rounded-md mb-6 overflow-hidden bg-[var(--bg)]">
              <button type="button" onClick={() => setShowFm((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
                <span>Frontmatter{fmKeys.length ? ` · ${fmKeys.join(', ')}` : ''}</span>
                <span>{showFm ? 'Hide' : 'Show'}</span>
              </button>
              {showFm && <pre className="px-3 pb-3 text-[12px] font-mono text-[var(--fg-muted)] overflow-x-auto scroll-thin border-t border-[var(--border)] pt-3">{fm.raw}</pre>}
            </div>
          )}
        </>
      }
    />
  )
}

export function SkillDetail({ skill, home, update, checking, onCheck, tab, setTab, focus, setFocus, busy, onRun }: Props) {
  const readmePath = skill.skillFile.slice(skill.realPath.length + 1) || 'SKILL.md'
  // File contents are promises read with `use()`; this component remounts per skill (keyed by id).
  const [readme, setReadme] = useState(() => loadFile(skill.id, readmePath))
  const [file, setFile] = useState<OpenFile>(() => ({ path: readmePath, content: readme }))
  const [reloading, startReload] = useTransition()

  const openFile = (path: string) => setFile({ path, content: loadFile(skill.id, path) })
  const openRelative = (p: string) => {
    openFile(p)
    setTab('files')
  }

  // A transition keeps the current document (and its scroll position) on screen until the re-read resolves.
  const reload = () => {
    if (tab === 'readme') {
      const next = loadFile(skill.id, readmePath)
      startReload(() => setReadme(next))
    } else if (tab === 'files') {
      const next = loadFile(skill.id, file.path)
      startReload(() => setFile({ path: file.path, content: next }))
    }
  }

  const loc = skill.locations[0]
  const crumb = loc ? tildify(loc.path, home) + (loc.isSymlink && loc.linkTarget ? ` → ${tildify(loc.linkTarget, home)}` : '') : tildify(skill.realPath, home)

  return (
    <div className="flex flex-col h-full min-h-0 @container">
      <div className="h-9 shrink-0 flex items-center gap-0.5 px-1 border-b border-[var(--border)] bg-[var(--bg-elev)]">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 h-9 px-3 text-[12.5px] border-b-2 -mb-px transition-colors ${
                active ? 'border-accent-500 text-[var(--fg)] font-medium' : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {t.icon}
              {t.label}
              {t.id === 'files' && <span className="text-[var(--fg-faint)] tabular-nums">{skill.fileCount}</span>}
            </button>
          )
        })}
        <span className="ml-auto flex items-center gap-0.5 min-w-0 text-[11.5px] font-mono text-[var(--fg-faint)] pl-3">
          <span className="truncate hidden @lg:inline" title={crumb}>
            {crumb}
          </span>
          <CopyButton text={skill.realPath} className="h-7 w-7 text-[var(--fg-faint)]" />
        </span>
        {tab !== 'info' && (
          <button type="button" className="btn btn-ghost btn-icon h-7 w-7 text-[var(--fg-muted)]" onClick={reload} disabled={reloading} title="Reload this file from disk">
            <RefreshCw className={`h-4 w-4 ${reloading ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-icon h-7 w-7 text-[var(--fg-muted)]" onClick={() => setFocus(!focus)} title={focus ? 'Exit reading mode (\\)' : 'Reading mode: hide the list and filters (\\)'}>
          {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-2.5 p-2.5">
        <div className="flex-1 min-h-0 surface overflow-hidden flex flex-col">
          {tab === 'readme' && (
            <Suspense fallback={<div className="p-6 text-sm text-[var(--fg-muted)]">Loading…</div>}>
              <Readme content={readme} frontmatter={skill.frontmatter} header={<DocHeader skill={skill} update={update} checking={checking} />} onOpenRelative={openRelative} />
            </Suspense>
          )}
          {tab === 'files' && <FileBrowser files={skill.files} file={file} onSelect={openFile} />}
          {tab === 'info' && (
            <div className="h-full overflow-y-auto scroll-thin">
              <InfoPanel skill={skill} home={home} update={update} />
            </div>
          )}
        </div>
        <CommandsDrawer skill={skill} update={update} checking={checking} onCheck={onCheck} busy={busy} onRun={onRun} />
      </div>
    </div>
  )
}
