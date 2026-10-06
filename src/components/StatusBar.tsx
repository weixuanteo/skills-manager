import type { ScanResult } from '@shared/types'

interface Props {
  scan: ScanResult | null
  shown: number
  hiddenBuiltIns: number
  onShowBuiltIns: () => void
}

export function StatusBar({ scan, shown, hiddenBuiltIns, onShowBuiltIns }: Props) {
  return (
    <div className="h-[26px] shrink-0 border-t border-[var(--border)] bg-[var(--bg-elev)] flex items-center gap-4 px-3 text-[11.5px] text-[var(--fg-muted)] whitespace-nowrap overflow-hidden">
      {scan ? (
        <span className="tabular-nums">
          {shown} of {scan.skills.length} skills · {scan.roots.filter((r) => r.exists).length} locations · scanned {new Date(scan.scannedAt).toLocaleTimeString()} in {scan.durationMs} ms
        </span>
      ) : (
        <span>Scanning skill directories…</span>
      )}
      {hiddenBuiltIns > 0 && (
        <span>
          {hiddenBuiltIns} Codex built-in{hiddenBuiltIns === 1 ? '' : 's'} hidden ·{' '}
          <button type="button" className="text-accent-600 dark:text-accent-300 hover:underline" onClick={onShowBuiltIns}>
            show
          </button>
        </span>
      )}
      <span className="flex-1" />
      <span className="hidden md:flex items-center gap-4 text-[var(--fg-faint)]">
        <span>
          <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> move
        </span>
        <span>
          <kbd className="kbd">/</kbd> search
        </span>
        <span>
          <kbd className="kbd">[</kbd> filters
        </span>
        <span>
          <kbd className="kbd">\</kbd> reading mode
        </span>
      </span>
    </div>
  )
}
