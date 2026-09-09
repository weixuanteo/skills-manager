import type { AgentId, InstallMethod, UpdateState } from '@shared/types'

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso)
  if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  const d = h / 24
  if (d < 30) return `${Math.floor(d)}d ago`
  const mo = d / 30
  if (mo < 12) return `${Math.floor(mo)}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export function tildify(p: string, home: string): string {
  if (!home) return p
  if (p === home) return '~'
  return p.startsWith(home + '/') ? '~' + p.slice(home.length) : p
}

export const AGENT_LABELS: Record<AgentId, string> = {
  universal: 'Universal',
  claude: 'Claude Code',
  codex: 'Codex',
  cursor: 'Cursor',
  gemini: 'Gemini CLI',
  copilot: 'Copilot',
  windsurf: 'Windsurf',
  kiro: 'Kiro',
  opencode: 'OpenCode',
  amp: 'Amp',
  goose: 'Goose',
  cline: 'Cline',
  roo: 'Roo Code',
  github: 'GitHub',
  'claude-plugin': 'Claude plugin',
}

export const AGENT_COLORS: Record<AgentId, string> = {
  universal: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  claude: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  'claude-plugin': 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  codex: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  cursor: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  gemini: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  copilot: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  windsurf: 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30',
  kiro: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30',
  opencode: 'bg-lime-500/15 text-lime-700 dark:text-lime-300 border-lime-500/30',
  amp: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  goose: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  cline: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  roo: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  github: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
}

export const METHOD_LABELS: Record<InstallMethod, string> = {
  'skills-cli': 'skills CLI',
  'claude-plugin': 'Claude plugin',
  'codex-system': 'Codex built-in',
  npm: 'npm package',
  'git-clone': 'git clone',
  'git-symlink': 'symlink → git',
  symlink: 'symlink',
  manual: 'manual',
}

export const UPDATE_LABELS: Record<UpdateState, string> = {
  'up-to-date': 'Up to date',
  'update-available': 'Update available',
  'local-ahead': 'Local ahead',
  unknown: 'Unknown',
  unsupported: 'Not checkable',
  error: 'Check failed',
}

export const UPDATE_COLORS: Record<UpdateState, string> = {
  'up-to-date': 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'update-available': 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40',
  'local-ahead': 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30',
  unknown: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/30',
  unsupported: 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
}
