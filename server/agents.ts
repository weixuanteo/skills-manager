import type { AgentId } from '../shared/types.ts'

export interface AgentDef {
  id: AgentId
  label: string
  /** Skill directories relative to a root (home dir for global, project dir for project scope). */
  dirs: string[]
  /** Only meaningful at project scope. */
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

export const AGENT_LABELS: Record<AgentId, string> = Object.fromEntries(
  AGENTS.map((a) => [a.id, a.label]),
) as Record<AgentId, string>
AGENT_LABELS['claude-plugin'] = 'Claude Code plugin'
