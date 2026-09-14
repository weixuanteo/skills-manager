import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { CopyButton } from './CommandBlock'

interface Props {
  source: string
  onOpenRelative?: (relPath: string) => void
  /** Current file's directory, relative to the skill root. */
  baseDir?: string
}

function resolveRel(baseDir: string, href: string): string {
  const parts = (baseDir ? baseDir.split('/') : []).filter(Boolean)
  for (const seg of href.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return parts.join('/')
}

function textOf(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object' && node && 'props' in node) return textOf((node as { props: { children?: unknown } }).props.children)
  return ''
}

export function Markdown({ source, onOpenRelative, baseDir = '' }: Props) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children, ...rest }) {
        const isExternal = !!href && /^(https?:|mailto:|#)/.test(href)
        if (!isExternal && href && onOpenRelative) {
          const target = resolveRel(baseDir, href.split('#')[0])
          return (
            <a
              href={href}
              {...rest}
              onClick={(e) => {
                e.preventDefault()
                onOpenRelative(target)
              }}
              title={`Open ${target}`}
            >
              {children}
            </a>
          )
        }
        return (
          <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
            {children}
          </a>
        )
      },
      pre({ children, ...rest }) {
        const text = textOf(children)
        return (
          <div className="relative group not-prose my-4">
            <pre {...rest} className="bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg text-[13px] leading-relaxed p-3.5 overflow-x-auto scroll-thin font-mono">
              {children}
            </pre>
            <CopyButton text={text.replace(/\n$/, '')} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-[var(--bg-elev)]/80 backdrop-blur" />
          </div>
        )
      },
      img({ src, alt, ...rest }) {
        return <img src={src} alt={alt ?? ''} loading="lazy" {...rest} />
      },
    }),
    [onOpenRelative, baseDir],
  )
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
}
