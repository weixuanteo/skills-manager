import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, PanelRightClose, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Heading, OutlineNode } from '../lib/outline'
import { buildTree } from '../lib/outline'

interface Props {
  headings: Heading[]
  activeId: string | null
  onSelect: (h: Heading) => void
  onClose: () => void
}

export function Outline({ headings, activeId, onSelect, onClose }: Props) {
  const tree = useMemo(() => buildTree(headings), [headings])
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setCollapsed(new Set())
    setQuery('')
  }, [headings])

  useEffect(() => {
    if (searching) inputRef.current?.focus()
  }, [searching])

  const parentIds = useMemo(() => {
    const ids: string[] = []
    const walk = (nodes: OutlineNode[]) => {
      for (const n of nodes) {
        if (n.children.length) {
          ids.push(n.id)
          walk(n.children)
        }
      }
    }
    walk(tree)
    return ids
  }, [tree])

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!q) return tree
    const filter = (nodes: OutlineNode[]): OutlineNode[] =>
      nodes.flatMap((n) => {
        const kids = filter(n.children)
        return n.text.toLowerCase().includes(q) || kids.length ? [{ ...n, children: kids }] : []
      })
    return filter(tree)
  }, [tree, q])

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const closeSearch = () => {
    setSearching(false)
    setQuery('')
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-0.5 px-2 h-10 border-b border-[var(--border)] shrink-0">
        {searching ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Search className="h-3.5 w-3.5 text-[var(--fg-faint)] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && closeSearch()}
              placeholder="Filter headings…"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-[var(--fg-faint)]"
            />
            <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={closeSearch} title="Clear filter">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-faint)] px-1 flex-1">Outline</span>
            <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={() => setSearching(true)} title="Filter headings">
              <Search className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={() => setCollapsed(new Set())} title="Expand all" disabled={!parentIds.length}>
              <ChevronsUpDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={() => setCollapsed(new Set(parentIds))} title="Collapse all" disabled={!parentIds.length}>
              <ChevronsDownUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="btn btn-ghost btn-icon h-6 w-6" onClick={onClose} title="Hide outline">
              <PanelRightClose className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin py-1.5 pr-1">
        {visible.length ? (
          <Branch nodes={visible} depth={0} collapsed={q ? null : collapsed} toggle={toggle} activeId={activeId} onSelect={onSelect} />
        ) : (
          <div className="px-3 py-2 text-xs text-[var(--fg-faint)]">No matching headings.</div>
        )}
      </div>
    </div>
  )
}

function Branch({
  nodes,
  depth,
  collapsed,
  toggle,
  activeId,
  onSelect,
}: {
  nodes: OutlineNode[]
  depth: number
  /** null while filtering: every branch is forced open. */
  collapsed: Set<string> | null
  toggle: (id: string) => void
  activeId: string | null
  onSelect: (h: Heading) => void
}) {
  return (
    <ul className={depth ? 'relative ml-[15px] border-l border-[var(--border)]' : ''}>
      {nodes.map((n) => {
        const hasKids = n.children.length > 0
        const open = collapsed ? !collapsed.has(n.id) : true
        const active = n.id === activeId
        return (
          <li key={n.id}>
            <div
              className={`group flex items-start gap-0.5 rounded-md text-[13px] leading-snug hover:bg-[var(--bg-hover)] ${
                active ? 'text-accent-700 dark:text-accent-200 font-medium' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
              style={{ marginLeft: depth ? 4 : 0 }}
            >
              <button
                type="button"
                tabIndex={-1}
                aria-hidden={!hasKids}
                onClick={() => hasKids && toggle(n.id)}
                className={`h-6 w-5 shrink-0 flex items-center justify-center text-[var(--fg-faint)] ${hasKids ? 'hover:text-[var(--fg)]' : 'invisible'}`}
              >
                {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <button type="button" onClick={() => onSelect(n)} className="flex-1 min-w-0 text-left py-1 pr-2" title={n.text}>
                <span className="line-clamp-2 break-words">{n.text}</span>
              </button>
            </div>
            {hasKids && open && <Branch nodes={n.children} depth={depth + 1} collapsed={collapsed} toggle={toggle} activeId={activeId} onSelect={onSelect} />}
          </li>
        )
      })}
    </ul>
  )
}
