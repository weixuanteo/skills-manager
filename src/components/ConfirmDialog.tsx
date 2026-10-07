import { TriangleAlert, X } from 'lucide-react'
import { useCallback, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Command } from '@shared/types'
import { CopyButton } from './CommandBlock'

interface Props {
  title: string
  /** Label of the confirm button. */
  verb: string
  /** Commands to choose between; a single one is shown without a choice. */
  options: Command[]
  /** Red confirm button, for commands that remove something. */
  danger?: boolean
  busy: boolean
  onConfirm: (cmd: Command) => void
  onClose: () => void
}

/** Shows exactly what will run and asks once. Enter confirms, Escape cancels. */
export function ConfirmDialog({ title, verb, options, danger, busy, onConfirm, onClose }: Props) {
  const [picked, setPicked] = useState(() => Math.max(0, options.findIndex((o) => !o.danger)))
  const id = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cmd = options[picked]

  // Modal, so focus stays inside and the page behind is inert. Stable, so a re-render doesn't reopen it; the
  // button's ref is already set because children attach first. Closing on unmount returns focus to the opener.
  const showModal = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return
    dialog.showModal()
    confirmRef.current?.focus()
    return () => dialog.close()
  }, [])

  // In the body so it inherits nothing from the bar that opened it; keys stop here so the list behind doesn't react.
  return createPortal(
    <dialog
      ref={showModal}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[calc(100%-2rem)] max-w-xl bg-transparent text-[var(--fg)] backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="surface shadow-2xl fade-in flex flex-col max-h-[calc(100dvh-4rem)]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
          <h2 id={`${id}-title`} className="font-semibold min-w-0 break-words">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon shrink-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 min-h-0 overflow-y-auto scroll-thin">
          {options.length > 1 ? (
            <fieldset className="space-y-1.5">
              <legend className="sr-only">How</legend>
              {options.map((o, i) => (
                <label
                  key={o.command}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors ${i === picked ? 'border-accent-500/60 bg-accent-500/5' : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'}`}
                >
                  <input type="radio" name={id} checked={i === picked} onChange={() => setPicked(i)} className="mt-[3px] accent-accent-600" />
                  <span className="min-w-0">
                    <span className={`flex items-center gap-1.5 text-[13px] ${o.danger ? 'text-red-700 dark:text-red-400' : ''}`}>
                      {o.danger && <TriangleAlert className="h-3.5 w-3.5 shrink-0" />}
                      {o.title}
                    </span>
                    {o.note && <span className="block text-xs text-[var(--fg-muted)]">{o.note}</span>}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            cmd.note && <p className="text-sm text-[var(--fg-muted)]">{cmd.note}</p>
          )}
          <div>
            <div className="text-xs text-[var(--fg-muted)] mb-1.5">This runs on this machine:</div>
            <div className="flex items-start rounded-md border border-[var(--border)] bg-[var(--bg-sunken)]">
              <code className="flex-1 min-w-0 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">{cmd.command}</code>
              <CopyButton text={cmd.command} className="h-7 w-7 m-0.5" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)] shrink-0">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={() => onConfirm(cmd)}>
            {verb}
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
