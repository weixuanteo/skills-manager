import type { AgentId } from '../shared/types.ts'

export interface AgentDef {
  id: AgentId
  label: string
  /** Relative to home for global scans, or the project directory for project scans. */
  dirs: string[]
  projectOnly?: boolean
}

export const AGENTS: AgentDef[] = [
  { id: 'universal', label: 'Universal (.agents)', dirs: ['.agents/skills'] },
  { id: 'claude', label: 'Claude Code', dirs: ['.claude/skills'] },
  { id: 'codex', label: 'Codex', dirs: ['.codex/skills'] },
  { id: 'cursor', label: 'Cursor', dirs: ['.cursor/skills'] },
  { id: 'gemini', label: 'Gemini CLI', dirs: ['.gemini/skills'] },
  { id: 'copilot', label: 'GitHub Copilot', dirs: ['.copilot/skills'] },
  { id: 'windsurf', label: 'Windsurf', dirs: ['.windsurf/skills', '.codeium/windsurf/skills'] },
  { id: 'kiro', label: 'Kiro', dirs: ['.kiro/skills'] },
  { id: 'opencode', label: 'OpenCode', dirs: ['.config/opencode/skills', '.opencode/skills'] },
  { id: 'amp', label: 'Amp', dirs: ['.config/amp/skills'] },
  { id: 'goose', label: 'Goose', dirs: ['.config/goose/skills'] },
  { id: 'cline', label: 'Cline', dirs: ['.cline/skills'] },
  { id: 'roo', label: 'Roo Code', dirs: ['.roo/skills'] },
  { id: 'github', label: 'GitHub (.github)', dirs: ['.github/skills'], projectOnly: true },
]
