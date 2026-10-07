import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { INSTALL_AGENTS } from '../shared/agents.ts'
import type { InstallRequest, LogEntry, RemoteSkill } from '../shared/types.ts'
import { log } from './commandLog.ts'
import { shellQuote } from './util.ts'

// The skills CLI detects when it runs inside an agent and then forces `-y` and its own `-a`. Keep in
// sync with AGENT_DETECTION_ENV_VARS in vercel-labs/skills.
const AGENT_ENV = new Set([
  'AI_AGENT', 'ANTIGRAVITY_AGENT', 'AUGMENT_AGENT', 'CLAUDE_CODE', 'CLAUDE_CODE_IS_COWORK', 'CLAUDECODE',
  'CODEX_CI', 'CODEX_SANDBOX', 'CODEX_THREAD_ID', 'COPILOT_ALLOW_ALL', 'COPILOT_GITHUB_TOKEN', 'COPILOT_MODEL',
  'CURSOR_AGENT', 'CURSOR_EXTENSION_HOST_ROLE', 'CURSOR_TRACE_ID', 'GEMINI_CLI', 'OPENCODE_CLIENT', 'REPL_ID',
])

const TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT = 256 * 1024

function cleanEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !AGENT_ENV.has(k.toUpperCase())))
  return { ...env, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1', FORCE_COLOR: '0' }
}

export interface Invocation {
  file: string
  args: string[]
  cwd?: string
}

export function displayCommand(inv: Invocation): string {
  const cmd = [inv.file, ...inv.args].map(shellQuote).join(' ')
  return inv.cwd ? `cd ${shellQuote(inv.cwd)} && ${cmd}` : cmd
}

export const isUnsafeSkillName = (name: string) => name.startsWith('-') || name.includes('*')

const parentOf = (dir: string) => (dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '')

/**
 * One `skills add` per parent directory. Pointing the CLI at the directory that holds the chosen skills
 * makes its discovery find them regardless of how the repo is laid out (plugin manifests, nesting). A
 * skill whose name a sibling shares is pointed at directly, since `-s` selects by name.
 * `siblings` is every listed skill, used to spot those shared names.
 */
export function installInvocations(req: InstallRequest, skills: RemoteSkill[], siblings: RemoteSkill[] = skills): Invocation[] {
  const agents = req.agents.map((a) => INSTALL_AGENTS.find((x) => x.id === a)?.cli).filter((a): a is string => !!a)
  if (!agents.length) throw new Error('Pick at least one agent to install for.')
  const seen = new Set<string>()
  const bySource = new Map<string, string[]>()
  for (const s of skills) {
    // Names come from remote frontmatter; `--all` or `*` would make the CLI install everything.
    if (isUnsafeSkillName(s.name)) throw new Error(`Refusing to install a skill named "${s.name}".`)
    const key = s.name.toLowerCase()
    if (seen.has(key)) throw new Error(`Two picked skills are both named "${s.name}"; they would install into the same directory.`)
    seen.add(key)
    const parent = parentOf(s.dir)
    const shared = siblings.some((o) => o.dir !== s.dir && parentOf(o.dir) === parent && o.name.toLowerCase() === key)
    const dir = shared ? s.dir : parent
    bySource.set(dir, [...(bySource.get(dir) ?? []), s.name])
  }
  return [...bySource].map(([dir, names]) => {
    // `#ref` rather than a /tree/ URL, which the CLI would split at the first slash of a branch name.
    const source = [req.owner, req.repo, dir].filter(Boolean).join('/') + (req.ref ? `#${req.ref}` : '')
    const scopeArgs = req.scope.kind === 'global' ? ['-g'] : []
    return {
      file: 'npx',
      args: ['-y', 'skills', 'add', source, '-s', ...names, '-a', ...agents, ...scopeArgs, '-y'],
      cwd: req.scope.kind === 'project' ? path.resolve(req.scope.path) : undefined,
    }
  })
}

let busy = false

type Step = { inv?: Invocation; shell?: { command: string; cwd?: string } }

/** Runs one command at a time and records it in the command log; output is stdout and stderr interleaved, capped. */
export async function runExclusive(about: Pick<LogEntry, 'kind' | 'skills' | 'title'>, steps: Step[]): Promise<LogEntry> {
  if (busy) throw Object.assign(new Error('Another command is still running.'), { status: 409 })
  busy = true
  const started = Date.now()
  const commands: string[] = []
  let output = ''
  let ok = true
  try {
    for (const step of steps) {
      const display = step.inv ? displayCommand(step.inv) : step.shell!.command
      commands.push(display)
      output += `$ ${display}\n`
      const res = await spawnCapture(step)
      output += res.out
      if (!res.ok) {
        ok = false
        break
      }
    }
    const entry: LogEntry = { id: randomUUID(), ...about, ok, command: commands.join('\n'), output, startedAt: new Date(started).toISOString(), durationMs: Date.now() - started }
    await log.append(entry).catch((e) => console.error('could not write the command log', e))
    return entry
  } finally {
    busy = false
  }
}

function spawnCapture(step: Step): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = step.inv
      ? spawn(step.inv.file, step.inv.args, { cwd: step.inv.cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
      : spawn('bash', ['-c', step.shell!.command], { cwd: step.shell!.cwd, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    let out = ''
    let dropped = false
    // Keep the end, where a failure shows up.
    const add = (s: string) => {
      out += s
      if (out.length > MAX_OUTPUT) {
        out = out.slice(-MAX_OUTPUT)
        dropped = true
      }
    }
    const text = () => (dropped ? '[earlier output omitted]\n' : '') + out
    child.stdout.setEncoding('utf8').on('data', add)
    child.stderr.setEncoding('utf8').on('data', add)
    const timer = setTimeout(() => {
      out += `\nTimed out after ${TIMEOUT_MS / 60000} minutes.\n`
      // Its own process group, so npx's and bash's children go too.
      try {
        process.kill(-child.pid!, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    }, TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, out: text() + `${e.message}\n` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, out: text().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') + (code ? `\nExited with code ${code}.\n` : '') })
    })
  })
}
