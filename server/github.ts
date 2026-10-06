import type { FileContent, FileEntry, RemoteRepo, RemoteSkill, RepoRef } from '../shared/types.ts'
import { languageFor } from './languages.ts'
import { parseFrontmatter, run } from './util.ts'

// GitHub account names have no dots, which also rules out other hosts (gitlab.com/o/r).
const OWNER_RE = /^[A-Za-z0-9-]+$/
const REPO_RE = /^[A-Za-z0-9_.-]+$/
const SKIP_SEGMENTS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__'])
const MAX_SKILLS = 300
const MAX_FILE_BYTES = 1024 * 1024
const REPO_TTL_MS = 5 * 60 * 1000

/**
 * Accepts `owner/repo`, `owner/repo/sub/path`, `owner/repo#ref`, `github.com/owner/repo` and
 * `https://github.com/owner/repo/tree/<ref>/<sub/path>`. Like the skills CLI, a ref after `/tree/` is
 * a single path segment.
 */
export function parseRepoInput(input: string): RepoRef | undefined {
  let s = input.trim().replace(/^git@github\.com:/, 'github.com/')
  let ref: string | undefined
  const hash = s.indexOf('#')
  if (hash !== -1) {
    ref = s.slice(hash + 1) || undefined
    s = s.slice(0, hash)
  }
  s = s.replace(/^https?:\/\//, '').replace(/^(www\.)?github\.com\//, '').replace(/\/+$/, '')
  if (/^[a-z]+:/i.test(s) || s.includes('..')) return undefined
  const parts = s.split('/').filter(Boolean)
  if (parts.length < 2) return undefined
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/, '')
  let rest = parts.slice(2)
  if (rest[0] === 'tree' || rest[0] === 'blob') {
    if (!rest[1]) return undefined
    ref = rest[1]
    rest = rest.slice(2)
  }
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return undefined
  if (ref && !/^[A-Za-z0-9_.\-/]+$/.test(ref)) return undefined
  // A link to a SKILL.md file means its directory.
  if (rest.length && /^skill\.md$/i.test(rest[rest.length - 1])) rest = rest.slice(0, -1)
  const subpath = rest.join('/') || undefined
  return { owner, repo, ref, subpath }
}

class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

function token(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined
}

/**
 * Anonymous first; on 401/403/404 retry with GITHUB_TOKEN, then through `gh api`, which handles the
 * user's stored credentials without this process ever holding them.
 */
async function githubApi<T>(apiPath: string, accept = 'application/vnd.github+json'): Promise<T> {
  const url = `https://api.github.com/${apiPath}`
  const attempt = (auth?: string) =>
    fetch(url, {
      headers: { Accept: accept, 'User-Agent': 'skills-manager', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      signal: AbortSignal.timeout(20000),
    })
  let res = await attempt()
  const retryable = (r: Response) => r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429
  if (retryable(res) && token()) res = await attempt(token())
  if (res.ok) return (accept.endsWith('sha') ? await res.text() : await res.json()) as T
  if (retryable(res)) {
    const gh = await run('gh', ['api', '-H', `Accept: ${accept}`, apiPath], { timeoutMs: 30000 })
    if (gh.ok) return (accept.endsWith('sha') ? gh.stdout.trim() : JSON.parse(gh.stdout)) as T
  }
  const limited = res.status === 403 || res.status === 429
  const hint = limited ? ' GitHub rate limit reached; set GITHUB_TOKEN or log in with `gh auth login`.' : res.status === 404 ? ' Repository, branch or path not found.' : ''
  throw new GithubError(`GitHub API responded ${res.status}.${hint}`, res.status)
}

async function rawFile(r: RepoRef & { sha: string }, filePath: string): Promise<Buffer> {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/')
  const url = `https://raw.githubusercontent.com/${r.owner}/${r.repo}/${r.sha}/${encoded}`
  const attempt = (auth?: string) =>
    fetch(url, { headers: { 'User-Agent': 'skills-manager', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, signal: AbortSignal.timeout(20000) })
  let res = await attempt()
  if (res.status === 404 && token()) res = await attempt(token())
  if (res.ok) return Buffer.from(await res.arrayBuffer())
  if (res.status === 404) {
    // Private repositories: fall back to the contents API through `gh`.
    const gh = await run('gh', ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${r.owner}/${r.repo}/contents/${encoded}?ref=${r.sha}`], { timeoutMs: 30000 })
    if (gh.ok) return Buffer.from(gh.stdout, 'utf8')
  }
  throw new GithubError(`Could not fetch ${filePath} (${res.status}).`, res.status)
}

interface TreeEntry {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
}

interface Listing {
  repo: RemoteRepo
  blobs: Map<string, TreeEntry>
  at: number
}

/** Everything listed so far at one commit; listings of different subpaths add to the same snapshot. */
interface Snapshot {
  blobs: Map<string, TreeEntry>
  skills: Map<string, RemoteSkill>
}

const listings = new Map<string, Promise<Listing>>()
/** File and install requests resolve against the exact commit the client saw. */
const snapshots = new Map<string, Snapshot>()
const fileCache = new Map<string, FileContent>()

const snapshotKey = (owner: string, repo: string, sha: string) => `${owner}/${repo}@${sha}`.toLowerCase()

function buildFileTree(entries: TreeEntry[], base: string): FileEntry[] {
  const root: FileEntry[] = []
  const dirs = new Map<string, FileEntry>()
  const dirFor = (rel: string): FileEntry[] => {
    if (!rel) return root
    const existing = dirs.get(rel)
    if (existing) return existing.children!
    const slash = rel.lastIndexOf('/')
    const entry: FileEntry = { name: rel.slice(slash + 1), path: rel, type: 'dir', children: [] }
    dirs.set(rel, entry)
    dirFor(slash === -1 ? '' : rel.slice(0, slash)).push(entry)
    return entry.children!
  }
  for (const e of entries) {
    const rel = base ? e.path.slice(base.length + 1) : e.path
    const slash = rel.lastIndexOf('/')
    dirFor(slash === -1 ? '' : rel.slice(0, slash)).push({ name: rel.slice(slash + 1), path: rel, type: 'file', size: e.size })
  }
  // Directories first, then SKILL.md, then alphabetical: the same order the local scanner uses.
  const sort = (list: FileEntry[]) => {
    list.sort((a, b) => (a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name === 'SKILL.md' ? -1 : b.name === 'SKILL.md' ? 1 : a.name.localeCompare(b.name)))
    for (const e of list) if (e.children) sort(e.children)
  }
  sort(root)
  return root
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

/**
 * Lists every skill directory under the subpath, at any depth. This is broader than the skills CLI's
 * own discovery, which stops early in some layouts; installs stay exact because they point the CLI at
 * each skill's parent directory.
 */
export function headSha(ref: RepoRef): Promise<string> {
  return githubApi<string>(`repos/${ref.owner}/${ref.repo}/commits/${encodeURIComponent(ref.ref ?? 'HEAD')}`, 'application/vnd.github.sha')
}

async function loadListing(ref: RepoRef): Promise<Listing> {
  const sha = await headSha(ref)
  const tree = await githubApi<{ tree: TreeEntry[]; truncated: boolean }>(`repos/${ref.owner}/${ref.repo}/git/trees/${sha}?recursive=1`)
  const blobs = new Map(tree.tree.filter((e) => e.type === 'blob').map((e) => [e.path, e]))
  const prefix = ref.subpath ? ref.subpath + '/' : ''

  let dirs = [...blobs.keys()]
    // Exactly SKILL.md: the CLI looks for that name, so a skill.md would preview but not install.
    .filter((p) => p.startsWith(prefix) && /(^|\/)SKILL\.md$/.test(p) && !p.split('/').some((seg) => SKIP_SEGMENTS.has(seg)))
    .map((p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : ''))
    .sort()
  // A SKILL.md inside another skill (an example or template) belongs to the outer one.
  dirs = dirs.filter((d) => !dirs.some((o) => o !== d && (o === '' || d.startsWith(o + '/'))))

  const skipped: RemoteRepo['skipped'] = []
  if (tree.truncated) skipped.push({ dir: ref.subpath ?? '', reason: 'GitHub truncated the file listing for this repository, so some skills may be missing.' })
  if (dirs.length > MAX_SKILLS) {
    skipped.push({ dir: ref.subpath ?? '', reason: `Showing the first ${MAX_SKILLS} of ${dirs.length} skills. Narrow it with a subdirectory URL.` })
    dirs = dirs.slice(0, MAX_SKILLS)
  }

  const head = { ...ref, sha }
  const parsed = await mapLimit(dirs, 16, async (dir): Promise<RemoteSkill | undefined> => {
    const base = dir ? dir + '/' : ''
    let text: string
    try {
      text = (await rawFile(head, base + 'SKILL.md')).toString('utf8')
    } catch (e) {
      skipped.push({ dir, reason: (e as Error).message })
      return undefined
    }
    const fm = parseFrontmatter(text)
    const name = typeof fm.data.name === 'string' ? fm.data.name.trim() : ''
    const description = typeof fm.data.description === 'string' ? fm.data.description.trim() : ''
    if (!name || !description) {
      // The skills CLI refuses these too.
      skipped.push({ dir, reason: Object.keys(fm.data).length ? 'SKILL.md frontmatter is missing a name or description.' : 'SKILL.md has no valid YAML frontmatter.' })
      return undefined
    }
    const entries = [...blobs.values()].filter((e) => e.path.startsWith(base))
    return {
      name,
      description,
      dir,
      frontmatter: fm.data,
      files: buildFileTree(entries, dir),
      fileCount: entries.length,
      totalSize: entries.reduce((s, e) => s + (e.size ?? 0), 0),
      executables: entries.filter((e) => e.mode === '100755').map((e) => e.path.slice(base.length)),
    }
  })

  const repo: RemoteRepo = { ...ref, sha, skills: parsed.filter((s): s is RemoteSkill => !!s), skipped }
  return { repo, blobs, at: Date.now() }
}

export async function resolveRepo(ref: RepoRef, refresh = false): Promise<RemoteRepo> {
  // Refs and paths are case-sensitive; owner and repo names are not.
  const key = `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${ref.ref ?? ''}:${ref.subpath ?? ''}`
  const cached = listings.get(key)
  if (cached && !refresh) {
    const l = await cached.catch(() => undefined)
    if (l && Date.now() - l.at < REPO_TTL_MS) return l.repo
  }
  const p = loadListing(ref)
  listings.set(key, p)
  p.catch(() => listings.delete(key))
  const listing = await p
  const sk = snapshotKey(ref.owner, ref.repo, listing.repo.sha)
  const snap = snapshots.get(sk) ?? { blobs: listing.blobs, skills: new Map() }
  for (const skill of listing.repo.skills) snap.skills.set(skill.dir, skill)
  snapshots.set(sk, snap)
  return listing.repo
}

export function listedSkills(owner: string, repo: string, sha: string): RemoteSkill[] {
  return [...(snapshots.get(snapshotKey(owner, repo, sha))?.skills.values() ?? [])]
}

/** Looks up a skill from a listing this server has already returned. */
export function listedSkill(owner: string, repo: string, sha: string, dir: string): RemoteSkill | undefined {
  return snapshots.get(snapshotKey(owner, repo, sha))?.skills.get(dir)
}

export async function remoteFile(owner: string, repo: string, sha: string, filePath: string): Promise<FileContent> {
  const snap = snapshots.get(snapshotKey(owner, repo, sha))
  if (!snap) throw new GithubError('Unknown listing; reload the repository.', 404)
  const entry = snap.blobs.get(filePath)
  if (!entry || ![...snap.skills.keys()].some((dir) => dir === '' || filePath.startsWith(dir + '/'))) throw new GithubError('File is not part of a listed skill.', 404)
  const key = `${owner}/${repo}@${sha}:${filePath}`
  const hit = fileCache.get(key)
  if (hit) return hit
  const size = entry.size ?? 0
  const buf = await rawFile({ owner, repo, sha }, filePath)
  const sample = buf.subarray(0, Math.min(buf.length, 8000))
  const binary = sample.includes(0)
  const body: FileContent = {
    path: filePath,
    content: binary ? '' : buf.subarray(0, MAX_FILE_BYTES).toString('utf8'),
    size,
    language: languageFor(filePath),
    truncated: size > MAX_FILE_BYTES,
    binary,
  }
  if (fileCache.size > 500) fileCache.delete(fileCache.keys().next().value!)
  fileCache.set(key, body)
  return body
}

export { GithubError }
