import { ListTree, PanelRightOpen } from 'lucide-react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { usePersistedBool } from '../hooks/usePersisted'
import { focusOnMount } from '../lib/dom'
import { collectHeadings, type Heading } from '../lib/outline'
import { Markdown } from './Markdown'
import { Outline } from './Outline'

const OUTLINE_KEY = 'sm-outline'
const SCROLL_PAD = 16

interface Props {
  source: string
  baseDir?: string
  onOpenRelative?: (relPath: string) => void
  /** Scrolls with the document. */
  header?: ReactNode
}

/** Read headings from the rendered DOM so the outline matches the document. */
export function MarkdownDocument({ source, baseDir, onOpenRelative, header }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = usePersistedBool(OUTLINE_KEY, true)
  // Don't persist the popover: it covers the document.
  const [popoverOpen, setPopoverOpen] = useState(false)
  // Keep the clicked heading active until user input; headings near the end cannot scroll to the top.
  const pinned = useRef<string | null>(null)
  const raf = useRef(0)

  const activeFor = (hs: Heading[]): string | null => {
    const el = scrollRef.current
    if (!el || !hs.length) return null
    if (pinned.current) return pinned.current
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) return hs[hs.length - 1].id
    const top = el.getBoundingClientRect().top + SCROLL_PAD + 1
    let current: Heading | null = null
    for (const h of hs) {
      if (h.el.getBoundingClientRect().top <= top) current = h
      else break
    }
    return (current ?? hs[0]).id
  }

  // Callers mount a fresh instance per document (via `key`), so a `source` change here is a re-read
  // of the same file: the callback identity changes with it, which re-collects the headings but keeps
  // the scroll position.
  const mdRef = useCallback(
    (el: HTMLDivElement | null) => {
      const hs = el ? collectHeadings(el) : []
      setHeadings(hs)
      setActiveId(activeFor(hs))
    },
    [source],
  )

  const onScroll = () => {
    if (raf.current) return
    raf.current = requestAnimationFrame(() => {
      raf.current = 0
      setActiveId(activeFor(headings))
    })
  }
  const unpin = () => {
    pinned.current = null
  }

  const jumpTo = (h: Heading) => {
    const el = scrollRef.current
    if (!el) return
    const top = h.el.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - SCROLL_PAD
    pinned.current = h.id
    setActiveId(h.id)
    setPopoverOpen(false)
    el.scrollTo({ top, behavior: 'smooth' })
  }

  const showOutline = headings.length > 1
  const cornerBtn = 'btn btn-ghost btn-icon absolute top-2 right-2 bg-[var(--bg-elev)]/80 backdrop-blur border border-[var(--border)]'

  return (
    <div className="relative flex h-full min-h-0 @container">
      <div ref={scrollRef} onScroll={onScroll} onWheel={unpin} onTouchStart={unpin} onKeyDown={unpin} className="flex-1 min-w-0 h-full overflow-y-auto scroll-thin">
        <div className="px-5 py-5 sm:px-8 sm:py-6 max-w-4xl mx-auto fade-in">
          {header}
          <div ref={mdRef}>
            <Markdown source={source} baseDir={baseDir} onOpenRelative={onOpenRelative} />
          </div>
        </div>
      </div>
      {/* Wide panes get an outline column; narrow ones get a popover. */}
      {showOutline && open && (
        <aside className="hidden @5xl:flex w-[240px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] flex-col min-h-0">
          <Outline headings={headings} activeId={activeId} onSelect={jumpTo} onClose={() => setOpen(false)} />
        </aside>
      )}
      {showOutline && !open && (
        <button type="button" onClick={() => setOpen(true)} title="Show outline" className={`${cornerBtn} hidden @5xl:inline-flex`}>
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
      {showOutline && !popoverOpen && (
        <button type="button" onClick={() => setPopoverOpen(true)} title="Outline" className={`${cornerBtn} shadow-sm @5xl:hidden`}>
          <ListTree className="h-4 w-4" />
        </button>
      )}
      {showOutline && popoverOpen && (
        <>
          <div className="absolute inset-0 z-10 @5xl:hidden" onClick={() => setPopoverOpen(false)} aria-hidden="true" />
          <aside
            ref={focusOnMount}
            tabIndex={-1}
            onKeyDown={(e) => e.key === 'Escape' && setPopoverOpen(false)}
            className="absolute top-2 right-2 bottom-2 z-20 w-[min(280px,calc(100%-1rem))] surface shadow-xl flex flex-col min-h-0 overflow-hidden fade-in @5xl:hidden"
          >
            <Outline headings={headings} activeId={activeId} onSelect={jumpTo} onClose={() => setPopoverOpen(false)} />
          </aside>
        </>
      )}
    </div>
  )
}
