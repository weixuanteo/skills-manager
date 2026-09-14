import { PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { collectHeadings, type Heading } from '../lib/outline'
import { Markdown } from './Markdown'
import { Outline } from './Outline'

const OUTLINE_KEY = 'sm-outline'
const SCROLL_PAD = 16

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
  // After an outline click the target may not be able to reach the top of the viewport (end of document),
  // so keep it active until the user scrolls on their own.
  const pinned = useRef<string | null>(null)

  const toggleOutline = (v: boolean) => {
    setOpen(v)
    localStorage.setItem(OUTLINE_KEY, v ? '1' : '0')
  }

  useLayoutEffect(() => {
    pinned.current = null
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
    el.scrollTo({ top, behavior: 'smooth' })
  }, [])

  const showOutline = headings.length > 1

  return (
    <div className="relative flex h-full min-h-0 @container">
      <div ref={scrollRef} className="flex-1 min-w-0 h-full overflow-y-auto scroll-thin">
        <div className="p-6 max-w-4xl fade-in">
          {header}
          <div ref={mdRef}>
            <Markdown source={source} baseDir={baseDir} onOpenRelative={onOpenRelative} />
          </div>
        </div>
      </div>
      {showOutline && open && (
        <aside className="w-[260px] shrink-0 border-l border-[var(--border)] bg-[var(--bg)] hidden @2xl:flex flex-col min-h-0">
          <Outline headings={headings} activeId={activeId} onSelect={jumpTo} onClose={() => toggleOutline(false)} />
        </aside>
      )}
      {showOutline && !open && (
        <button
          type="button"
          onClick={() => toggleOutline(true)}
          title="Show outline"
          className="btn btn-ghost btn-icon absolute top-2 right-2 hidden @2xl:inline-flex bg-[var(--bg-elev)]/80 backdrop-blur border border-[var(--border)]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
