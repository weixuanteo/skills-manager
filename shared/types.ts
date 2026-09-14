export type AgentId =
  | 'universal'
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'gemini'
  | 'copilot'
  | 'windsurf'
  | 'kiro'
  | 'opencode'
  | 'amp'
  | 'goose'
  | 'cline'
  | 'roo'
  | 'github'
  | 'claude-plugin'

export type Scope = 'global' | 'project'

export type InstallMethod =
  | 'skills-cli'
  | 'claude-plugin'
  | 'codex-system'
  | 'npm'
  | 'git-clone'
  | 'git-symlink'
  | 'symlink'
  | 'manual'

export interface Command {
  title: string
  command: string
  note?: string
  danger?: boolean
}

export interface SkillLocation {
  /** The path inside the skills directory (may be a symlink). */
  path: string
  agent: AgentId
  scope: Scope
  isSymlink: boolean
  linkTarget?: string
  /** The scan root this location was found under. */
  root: string
}

export interface FileEntry {
  name: string
  path: string // relative to skill realPath
  type: 'file' | 'dir'
  size?: number
  children?: FileEntry[]
}

export interface GitInfo {
  repoRoot: string
  remote?: string
  remoteUrl?: string
  branch?: string
  head?: string
  upstream?: string
  /** Path of the skill inside the repo (relative). */
  subPath: string
}

export interface NpmInfo {
  packageName: string
  packageRoot: string
  installedVersion?: string
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun'
  global: boolean
  /** Project root that owns the node_modules (for local installs). */
  projectRoot?: string
}

export interface SkillsCliInfo {
  lockfile: string
  source?: string
  sourceType?: string
  sourceUrl?: string
  skillPath?: string
  installedAt?: string
  updatedAt?: string
  hash?: string
  global: boolean
}

export interface ClaudePluginInfo {
  plugin: string
  marketplace?: string
  version?: string
  installPath: string
}

export interface InstallInfo {
  method: InstallMethod
  label: string
  summary: string
  git?: GitInfo
  npm?: NpmInfo
  skillsCli?: SkillsCliInfo
  claudePlugin?: ClaudePluginInfo
  removeCommands: Command[]
  updateCommands: Command[]
  /** Whether the server can check for updates for this skill. */
  updateCheckable: boolean
  updateCheckHint?: string
}

export interface Skill {
  id: string
  name: string
  description?: string
  frontmatter: Record<string, unknown>
  realPath: string
  skillFile: string
  locations: SkillLocation[]
  agents: AgentId[]
  scopes: Scope[]
  files: FileEntry[]
  fileCount: number
  totalSize: number
  lastModified: string
  install: InstallInfo
  warnings: string[]
}

export interface ScanRoot {
  path: string
  agent: AgentId
  scope: Scope
  exists: boolean
  skillCount: number
  label: string
}

export interface ScanResult {
  skills: Skill[]
  roots: ScanRoot[]
  projectRoots: string[]
  home: string
  issues: string[]
  scannedAt: string
  durationMs: number
}

export type UpdateState =
  | 'up-to-date'
  | 'update-available'
  | 'local-ahead'
  | 'unknown'
  | 'unsupported'
  | 'error'

export interface UpdateStatus {
  skillId: string
  state: UpdateState
  current?: string
  latest?: string
  message?: string
  checkedAt: string
}

export interface FileContent {
  path: string
  content: string
  size: number
  language: string
  truncated: boolean
  binary: boolean
}

export interface AppConfig {
  projectRoots: string[]
}
