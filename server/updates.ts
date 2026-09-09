import path from 'node:path'
import type { Skill, UpdateStatus } from '../shared/types.ts'
import { run } from './util.ts'

const cache = new Map<string, { at: number; value: Omit<UpdateStatus, 'skillId'> }>()
const TTL_MS = 5 * 60 * 1000

function cached(key: string): Omit<UpdateStatus, 'skillId'> | undefined {
  const c = cache.get(key)
  if (c && Date.now() - c.at < TTL_MS) return c.value
  return undefined
}
function remember(key: string, value: Omit<UpdateStatus, 'skillId'>) {
  cache.set(key, { at: Date.now(), value })
  return value
}

const inflight = new Map<string, Promise<Omit<UpdateStatus, 'skillId'>>>()
function dedupe(key: string, fn: () => Promise<Omit<UpdateStatus, 'skillId'>>) {
  const c = cached(key)
  if (c) return Promise.resolve(c)
  const existing = inflight.get(key)
  if (existing) return existing
  const p = fn()
    .then((v) => remember(key, v))
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

const now = () => new Date().toISOString()

async function checkGit(skill: Skill): Promise<Omit<UpdateStatus, 'skillId'>> {
  const git = skill.install.git!
  const branch = git.upstream?.includes('/') ? git.upstream.slice(git.upstream.indexOf('/') + 1) : git.branch
  const remote = git.remote
  if (!remote || !branch || branch === 'HEAD') {
    return { state: 'unsupported', message: 'Detached HEAD or no remote configured.', checkedAt: now() }
  }
  return dedupe(`git:${git.repoRoot}:${remote}:${branch}`, async () => {
    const ls = await run('git', ['-C', git.repoRoot, 'ls-remote', '--heads', remote, branch], { timeoutMs: 20000 })
    if (!ls.ok) {
      return { state: 'error', message: `git ls-remote failed: ${ls.stderr.trim().split('\n')[0] || 'unknown error'}`, checkedAt: now() }
    }
    const line = ls.stdout.split('\n').find((l) => l.trim().endsWith(`refs/heads/${branch}`))
    const remoteSha = line?.split(/\s+/)[0]
    if (!remoteSha) return { state: 'unknown', message: `Branch ${branch} not found on ${remote}.`, checkedAt: now() }
    const head = (await run('git', ['-C', git.repoRoot, 'rev-parse', 'HEAD'])).stdout.trim()
    const short = (s: string) => s.slice(0, 7)
    if (remoteSha === head) return { state: 'up-to-date', current: short(head), latest: short(remoteSha), message: `Local HEAD matches ${remote}/${branch}.`, checkedAt: now() }
    const ancestor = await run('git', ['-C', git.repoRoot, 'merge-base', '--is-ancestor', remoteSha, head])
    if (ancestor.ok) return { state: 'local-ahead', current: short(head), latest: short(remoteSha), message: `Local checkout is ahead of ${remote}/${branch}.`, checkedAt: now() }
    return { state: 'update-available', current: short(head), latest: short(remoteSha), message: `${remote}/${branch} has new commits.`, checkedAt: now() }
  })
}

async function checkNpm(skill: Skill): Promise<Omit<UpdateStatus, 'skillId'>> {
  const npm = skill.install.npm!
  return dedupe(`npm:${npm.packageName}`, async () => {
    const r = await run('npm', ['view', npm.packageName, 'version', '--json'], { timeoutMs: 20000 })
    if (!r.ok) return { state: 'error', message: `npm view failed: ${r.stderr.trim().split('\n')[0] || 'unknown error'}`, checkedAt: now() }
    let latest: string | undefined
    try {
      const parsed = JSON.parse(r.stdout)
      latest = Array.isArray(parsed) ? parsed[parsed.length - 1] : String(parsed)
    } catch {
      latest = r.stdout.trim().replace(/^"|"$/g, '')
    }
    const current = npm.installedVersion
    if (!latest) return { state: 'unknown', current, message: 'Could not read the latest version from the registry.', checkedAt: now() }
    if (!current) return { state: 'unknown', latest, message: 'Installed version unknown.', checkedAt: now() }
    const cmp = compareSemver(current, latest)
    if (cmp === 0) return { state: 'up-to-date', current, latest, message: 'Installed version is the latest.', checkedAt: now() }
    if (cmp > 0) return { state: 'local-ahead', current, latest, message: 'Installed version is newer than the registry "latest" tag.', checkedAt: now() }
    return { state: 'update-available', current, latest, message: `Version ${latest} is available.`, checkedAt: now() }
  })
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.+-]/).map((x) => (isNaN(Number(x)) ? x : Number(x)))
  const pb = b.replace(/^v/, '').split(/[.+-]/).map((x) => (isNaN(Number(x)) ? x : Number(x)))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x === y) continue
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1
    return String(x) < String(y) ? -1 : 1
  }
  return 0
}

function parseGithubSource(cli: NonNullable<Skill['install']['skillsCli']>): { owner: string; repo: string; ref?: string } | undefined {
  const candidates = [cli.source, cli.sourceUrl].filter(Boolean) as string[]
  for (const c of candidates) {
    let m = /github\.com[/:]([^/]+)\/([^/#?]+?)(?:\.git)?(?:\/tree\/([^/]+))?(?:[/#?].*)?$/.exec(c)
    if (m) return { owner: m[1], repo: m[2], ref: m[3] }
    m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([^/]+))?$/.exec(c)
    if (m) return { owner: m[1], repo: m[2], ref: m[3] }
  }
  return undefined
}

async function checkSkillsCli(skill: Skill): Promise<Omit<UpdateStatus, 'skillId'>> {
  const cli = skill.install.skillsCli!
  const gh = parseGithubSource(cli)
  if (!gh) return { state: 'unsupported', message: `Cannot resolve "${cli.source ?? cli.sourceUrl}" to a GitHub repository. Run "npx skills check".`, checkedAt: now() }
  const skillPath = cli.skillPath ?? ''
  return dedupe(`skills-cli:${gh.owner}/${gh.repo}:${skillPath}:${gh.ref ?? ''}`, async () => {
    const url = new URL(`https://api.github.com/repos/${gh.owner}/${gh.repo}/commits`)
    url.searchParams.set('per_page', '1')
    if (skillPath) url.searchParams.set('path', skillPath)
    if (gh.ref) url.searchParams.set('sha', gh.ref)
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'skills-manager' }, signal: AbortSignal.timeout(15000) })
    } catch (e) {
      return { state: 'error', message: `GitHub request failed: ${(e as Error).message}`, checkedAt: now() }
    }
    if (!res.ok) return { state: 'error', message: `GitHub API responded ${res.status}${res.status === 403 ? ' (rate limited?)' : ''}.`, checkedAt: now() }
    const data = (await res.json()) as { sha?: string; commit?: { committer?: { date?: string }; author?: { date?: string } } }[]
    const latest = data[0]
    if (!latest?.sha) return { state: 'unknown', message: 'No commits found for this path upstream.', checkedAt: now() }
    const latestDate = latest.commit?.committer?.date ?? latest.commit?.author?.date
    const short = latest.sha.slice(0, 7)
    if (cli.hash && (cli.hash === latest.sha || latest.sha.startsWith(cli.hash))) {
      return { state: 'up-to-date', current: cli.hash.slice(0, 7), latest: short, message: 'Lockfile hash matches the latest upstream commit.', checkedAt: now() }
    }
    const installed = cli.updatedAt ?? cli.installedAt
    if (installed && latestDate) {
      const iTime = Date.parse(installed)
      const lTime = Date.parse(latestDate)
      if (!isNaN(iTime) && !isNaN(lTime)) {
        if (lTime > iTime)
          return { state: 'update-available', current: installed.slice(0, 10), latest: `${short} (${latestDate.slice(0, 10)})`, message: 'Upstream changed after this skill was installed. Confirm with "npx skills check".', checkedAt: now() }
        return { state: 'up-to-date', current: installed.slice(0, 10), latest: `${short} (${latestDate.slice(0, 10)})`, message: 'No upstream commits since installation.', checkedAt: now() }
      }
    }
    return { state: 'unknown', latest: short, message: 'Lockfile has no timestamp or hash to compare. Run "npx skills check".', checkedAt: now() }
  })
}

export async function checkUpdate(skill: Skill): Promise<UpdateStatus> {
  const base = { skillId: skill.id }
  try {
    if (!skill.install.updateCheckable) {
      return { ...base, state: 'unsupported', message: skill.install.updateCheckHint, checkedAt: now() }
    }
    switch (skill.install.method) {
      case 'npm':
        return { ...base, ...(await checkNpm(skill)) }
      case 'skills-cli':
        return { ...base, ...(await checkSkillsCli(skill)) }
      case 'git-clone':
      case 'git-symlink':
      case 'manual':
        if (skill.install.git) return { ...base, ...(await checkGit(skill)) }
        break
    }
    return { ...base, state: 'unsupported', message: skill.install.updateCheckHint, checkedAt: now() }
  } catch (e) {
    return { ...base, state: 'error', message: (e as Error).message, checkedAt: now() }
  }
}

export function clearUpdateCache() {
  cache.clear()
}

export const _internal = { compareSemver, parseGithubSource, path }
