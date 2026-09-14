import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { splitFrontmatter } from '../shared/frontmatter.ts'

export interface ExecResult {
  ok: boolean
  stdout: string
  stderr: string
  code: number | null
}

export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? 15000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...opts.env },
      },
      (err, stdout, stderr) => {
        const code = (err as NodeJS.ErrnoException & { code?: number | string })?.code
        resolve({
          ok: !err,
          stdout: String(stdout ?? ''),
          stderr: String(stderr ?? ''),
          code: typeof code === 'number' ? code : err ? 1 : 0,
        })
      },
    )
  })
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory()
  } catch {
    return false
  }
}

export async function readJson<T = unknown>(p: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf8')) as T
  } catch {
    return undefined
  }
}

export interface Frontmatter {
  data: Record<string, unknown>
  body: string
}

export function parseFrontmatter(src: string): Frontmatter {
  const { raw, body } = splitFrontmatter(src)
  if (raw == null) return { data: {}, body }
  let data: Record<string, unknown> = {}
  try {
    const parsed = parseYaml(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
  } catch {
    data = {}
  }
  return { data, body }
}

/** Walk up from `start` until `predicate` matches a directory; returns that directory. */
export async function findUp(start: string, predicate: (dir: string) => Promise<boolean>): Promise<string | undefined> {
  let dir = path.resolve(start)
  for (;;) {
    if (await predicate(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./:@~=+]+$/.test(s)) return s
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function tildify(p: string, home: string): string {
  if (p === home) return '~'
  if (p.startsWith(home + path.sep)) return '~' + p.slice(home.length)
  return p
}

export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function hashId(s: string): string {
  // FNV-1a 32-bit, twice with different seeds → short stable id
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 0x01000193) >>> 0
    h2 ^= c
    h2 = Math.imul(h2, 0x811c9dc5) >>> 0
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')
}
