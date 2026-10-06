import type { AgentId } from './types.ts'

/** Agents the `skills` CLI can install into, keyed by this app's id, with the CLI's `-a` value. */
export const INSTALL_AGENTS: { id: AgentId; cli: string; label: string }[] = [
  { id: 'claude', cli: 'claude-code', label: 'Claude Code' },
  { id: 'codex', cli: 'codex', label: 'Codex' },
  { id: 'cursor', cli: 'cursor', label: 'Cursor' },
  { id: 'gemini', cli: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'copilot', cli: 'github-copilot', label: 'Copilot' },
  { id: 'windsurf', cli: 'windsurf', label: 'Windsurf' },
  { id: 'kiro', cli: 'kiro-cli', label: 'Kiro' },
  { id: 'opencode', cli: 'opencode', label: 'OpenCode' },
  { id: 'amp', cli: 'amp', label: 'Amp' },
  { id: 'goose', cli: 'goose', label: 'Goose' },
  { id: 'cline', cli: 'cline', label: 'Cline' },
  { id: 'roo', cli: 'roo', label: 'Roo Code' },
]
