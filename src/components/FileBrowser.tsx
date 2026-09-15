import { ChevronDown, ChevronRight, File, FileCode2, FileText, Folder, FolderOpen, Loader2 } from 'lucide-react'
import { Suspense, use, useState } from 'react'
import type { FileEntry, Skill } from '@shared/types'
import type { FileResult } from '../lib/api'
import { formatBytes } from '../lib/format'
import { CopyButton } from './CommandBlock'
import { MarkdownDocument } from './MarkdownDocument'
import { splitFrontmatter } from '@shared/frontmatter'
import { CodeView } from './CodeView'

function iconFor(e: FileEntry, open: boolean) {
  if (e.type === 'dir') return open ? <FolderOpen className="h-4 w-4 text-accent-500" /> : <Folder className="h-4 w-4 text-accent-500" />
  if (/\.(md|mdx|markdown|txt)$/i.test(e.name)) return <FileText className="h-4 w-4 text-[var(--fg-faint)]" />
  if (/\.(ts|tsx|js|mjs|cjs|py|sh|rb|go|rs|json|ya?ml|toml)$/i.test(e.name)) return <FileCode2 className="h-4 w-4 text-[var(--fg-faint)]" />
  return <File className="h-4 w-4 text-[var(--fg-faint)]" />
}

function Tree({ entries, depth, selected, onSelect, openDirs, toggle }: { entries: FileEntry[]; depth: number; selected: string; onSelect: (p: string) => void; openDirs: Set<string>; toggle: (p: string) => void }) {
  return (
    <ul className="text-[13px]">
      {entries.map((e) => {
        const open = openDirs.has(e.path)
        const active = selected === e.path
        return (
          <li key={e.path}>
            <button
              type="button"
              onClick={() => (e.type === 'dir' ? toggle(e.path) : onSelect(e.path))}
              className={`w-full flex items-center gap-1.5 py-1 pr-2 rounded-md text-left hover:bg-[var(--bg-hover)] ${active ? 'bg-accent-500/10 text-accent-700 dark:text-accent-200' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
            >
              {e.type === 'dir' ? (open ? <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-faint)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--fg-faint)]" />) : <span className="w-3.5" />}
              {iconFor(e, open)}
              <span className="truncate flex-1">{e.name}</span>
              {e.type === 'file' && e.size != null && <span className="text-[11px] text-[var(--fg-faint)] tabular-nums">{formatBytes(e.size)}</span>}
            </button>
            {e.type === 'dir' && open && e.children && <Tree entries={e.children} depth={depth + 1} selected={selected} onSelect={onSelect} openDirs={openDirs} toggle={toggle} />}
          </li>
        )
      })}
    </ul>
  )
}

export interface OpenFile {
  path: string
  content: Promise<FileResult>
}

interface Props {
  skill: Skill
  file: OpenFile
  onSelect: (p: string) => void
}

function ancestorsOf(path: string): string[] {
  const parts = path.split('/')
  return parts.slice(1).map((_, i) => parts.slice(0, i + 1).join('/'))
}

function FileToolbar({ content, raw, setRaw }: { content: Promise<FileResult>; raw: boolean; setRaw: (fn: (r: boolean) => boolean) => void }) {
  const { file } = use(content)
  if (!file) return null
  return (
    <>
      {!file.binary && <span className="tabular-nums">· {formatBytes(file.size)}</span>}
      {file.truncated && <span className="text-amber-600 dark:text-amber-400">(truncated to 1 MB)</span>}
      <span className="flex-1" />
      {file.language === 'markdown' && (
        <button type="button" className="btn btn-ghost h-6 px-2 text-xs" onClick={() => setRaw((r) => !r)}>
          {raw ? 'Rendered' : 'Raw'}
        </button>
      )}
      {!file.binary && <CopyButton text={file.content} className="h-6 w-6" />}
    </>
  )
}

function FileView({ path, content, raw, onSelect }: { path: string; content: Promise<FileResult>; raw: boolean; onSelect: (p: string) => void }) {
  const { file, error } = use(content)
  if (error) return <div className="p-6 text-sm text-red-600 dark:text-red-400">{error}</div>
  if (!file) return null
  if (file.binary) return <div className="p-6 text-sm text-[var(--fg-muted)]">Binary file ({formatBytes(file.size)}), not displayed.</div>
  if (file.language === 'markdown' && !raw) {
    const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    return <MarkdownDocument key={path} source={splitFrontmatter(file.content).body} baseDir={baseDir} onOpenRelative={onSelect} />
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto scroll-thin">
      <CodeView code={file.content} language={file.language} />
    </div>
  )
}

export function FileBrowser({ skill, file, onSelect }: Props) {
  const [openDirs, setOpenDirs] = useState(() => new Set(ancestorsOf(file.path)))
  const [raw, setRaw] = useState(false)

  const toggle = (p: string) =>
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })

  const select = (p: string) => {
    setOpenDirs((prev) => new Set([...prev, ...ancestorsOf(p)]))
    onSelect(p)
  }

  return (
    <div className="grid grid-cols-[240px_1fr] grid-rows-[minmax(0,1fr)] h-full min-h-0">
      <aside className="min-h-0 border-r border-[var(--border)] overflow-y-auto scroll-thin py-2 pr-1">
        <Tree entries={skill.files} depth={0} selected={file.path} onSelect={select} openDirs={openDirs} toggle={toggle} />
      </aside>
      <section className="min-w-0 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[var(--border)] text-xs text-[var(--fg-muted)] shrink-0">
          <span className="font-mono truncate">{file.path}</span>
          <Suspense fallback={null}>
            <FileToolbar content={file.content} raw={raw} setRaw={setRaw} />
          </Suspense>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">
          <Suspense
            fallback={
              <div className="p-6 text-sm text-[var(--fg-muted)] flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            }
          >
            <FileView path={file.path} content={file.content} raw={raw} onSelect={select} />
          </Suspense>
        </div>
      </section>
    </div>
  )
}
