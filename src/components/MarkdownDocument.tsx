import { ListTree, PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { collectHeadings, type Heading } from '../lib/outline'
import { Markdown } from './Markdown'
import { Outline } from './Outline'

const OUTLINE_KEY = 'sm-outline'
const SCROLL_PAD = 16
/** Below this pane width the outline floats over the text instead of taking a column of its own. */
const INLINE_OUTLINE_MIN = 1024

interface Props {
  source: string
  baseDir?: string
  onOpenRelative?: (relPath: string) => void
  /** Rendered inside the scroll area, above the markdown (e.g. the frontmatter box). */
  header?: ReactNode
}

/**
 * Scrollable markdown view with a heading outline beside it. Headings are read back from the
 * rendered DOM so the outline always matches what is on screen, whatever the markdown syntax.
 */
export function MarkdownDocument({ source, baseDir, onOpenRelative, header }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const mdRef = useRef<HTMLDivElement | null>(null)
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [open, setOpen] = useState(() => localStorage.getItem(OUTLINE_KEY) !== '0')
  // Narrow panes: the outline is a popover opened on demand (never remembered, since it covers the text).
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [wide, setWide] = useState(true)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // After an outline click the target may not be able to reach the top of the viewport (end of document),
  // so keep it active until the user scrolls on their own.
  const pinned = useRef<string | null>(null)

  const toggleOutline = (v: boolean) => {
    setOpen(v)
    localStorage.setItem(OUTLINE_KEY, v ? '1' : '0')
  }

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= INLINE_OUTLINE_MIN))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    pinned.current = null
    setPopoverOpen(false)
    setHeadings(mdRef.current ? collectHeadings(mdRef.current) : [])
    setActiveId(null)
    scrollRef.current?.scrollTo({ top: 0 })
  }, [source])

  // Track which heading is at the top of the viewport.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !headings.length) return
    let raf = 0
    const update = () => {
      raf = 0
      if (pinned.current) {
        setActiveId(pinned.current)
        return
      }
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2
      if (atBottom) {
        setActiveId(headings[headings.length - 1].id)
        return
      }
      const top = el.getBoundingClientRect().top + SCROLL_PAD + 1
      let current: Heading | null = null
      for (const h of headings) {
        if (h.el.getBoundingClientRect().top <= top) current = h
        else break
      }
      setActiveId((current ?? headings[0]).id)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    const unpin = () => {
      pinned.current = null
    }
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('wheel', unpin, { passive: true })
    el.addEventListener('touchstart', unpin, { passive: true })
    el.addEventListener('keydown', unpin)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('wheel', unpin)
      el.removeEventListener('touchstart', unpin)
      el.removeEventListener('keydown', unpin)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [headings])

  const jumpTo = useCallback((h: Heading) => {
    const el = scrollRef.current
    if (!el) return
    const top = h.el.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - SCROLL_PAD
    pinned.current = h.id
    setActiveId(h.id)
    setPopoverOpen(false)
    el.scrollTo({ top, behavior: 'smooth' })
  }, [])

  // Esc closes the popover outline.
  useEffect(() => {
    if (!popoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setPopoverOpen(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [popoverOpen])

  const showOutline = headings.length > 1
  const inline = showOutline && wide && open

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0">
      <div ref={scrollRef} className="flex-1 min-w-0 h-full overflow-y-auto scroll-thin">
        <div className="px-5 py-5 sm:px-8 sm:py-6 max-w-4xl mx-auto fade-in">
          {header}
          <div ref={mdRef}>
            <Markdown source={source} baseDir={baseDir} onOpenRelative={onOpenRelative} />
          </div>
        </div>
      </div>
      {inline && (
        <aside className="w-[240px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] flex flex-col min-h-0">
          <Outline headings={headings} activeId={activeId} onSelect={jumpTo} onClose={() => toggleOutline(false)} />
        </aside>
      )}
      {showOutline && wide && !open && (
        <button
          type="button"
          onClick={() => toggleOutline(true)}
          title="Show outline"
          className="btn btn-ghost btn-icon absolute top-2 right-2 bg-[var(--bg-elev)]/80 backdrop-blur border border-[var(--border)]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
      {showOutline && !wide && !popoverOpen && (
        <button
          type="button"
          onClick={() => setPopoverOpen(true)}
          title="Outline"
          className="btn btn-ghost btn-icon absolute top-2 right-2 bg-[var(--bg-elev)]/80 backdrop-blur border border-[var(--border)] shadow-sm"
        >
          <ListTree className="h-4 w-4" />
        </button>
      )}
      {showOutline && !wide && popoverOpen && (
        <>
          <div className="absolute inset-0 z-10" onClick={() => setPopoverOpen(false)} aria-hidden="true" />
          <aside className="absolute top-2 right-2 bottom-2 z-20 w-[min(280px,calc(100%-1rem))] surface shadow-xl flex flex-col min-h-0 overflow-hidden fade-in">
            <Outline headings={headings} activeId={activeId} onSelect={jumpTo} onClose={() => setPopoverOpen(false)} />
          </aside>
        </>
      )}
    </div>
  )
}
