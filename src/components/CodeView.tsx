import { useMemo } from 'react'
import hljs from 'highlight.js/lib/common'

export function CodeView({ code, language }: { code: string; language: string }) {
  const html = useMemo(() => {
    try {
      if (language && language !== 'plaintext' && hljs.getLanguage(language)) return hljs.highlight(code, { language }).value
    } catch {
    }
    return escapeHtml(code)
  }, [code, language])
  const lines = useMemo(() => html.split('\n'), [html])
  return (
    <div className="font-mono text-[13px] leading-[1.6] fade-in">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="hover:bg-[var(--bg-hover)]">
              <td className="select-none text-right pr-4 pl-4 text-[var(--fg-faint)] tabular-nums w-[1%] align-top">{i + 1}</td>
              <td className="pr-4 whitespace-pre align-top hljs" dangerouslySetInnerHTML={{ __html: l || ' ' }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
