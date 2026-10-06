import type { ScanResult } from '@shared/types'

interface Props {
  scan: ScanResult | null
  shown: number
  /** Number of source segments reachable with the digit keys; 0 hides the hint. */
  sourceKeys: number
}

export function StatusBar({ scan, shown, sourceKeys }: Props) {
  return (
    <div className="h-[26px] shrink-0 border-t border-[var(--border)] bg-[var(--bg-elev)] flex items-center gap-4 px-3 text-[11.5px] text-[var(--fg-muted)] whitespace-nowrap overflow-hidden">
      {scan ? (
        <span className="tabular-nums">
          {shown} of {scan.skills.length} skills · {scan.roots.filter((r) => r.exists).length} locations · scanned {new Date(scan.scannedAt).toLocaleTimeString()} in {scan.durationMs} ms
        </span>
      ) : (
        <span>Scanning skill directories…</span>
      )}
      <span className="flex-1" />
      <span className="hidden md:flex items-center gap-4 text-[var(--fg-faint)]">
        <span>
          <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> move
        </span>
        <span>
          <kbd className="kbd">/</kbd> search
        </span>
        {sourceKeys > 0 && (
          <span>
            <kbd className="kbd">1</kbd>–<kbd className="kbd">{sourceKeys}</kbd> source
          </span>
        )}
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
