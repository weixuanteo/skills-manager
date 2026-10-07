import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import type { FileContent, InstallRequest, RemoteSkill, ScanResult, Skill, UpdateStatus } from '../shared/types.ts'
import { installInvocations, displayCommand, runExclusive } from './actions.ts'
import { log } from './commandLog.ts'
import { configPath, loadConfig, saveConfig } from './config.ts'
import { GithubError, headSha, listedSkill, listedSkills, parseRepoInput, remoteFile, resolveRepo } from './github.ts'
import { scanSkills } from './scanner.ts'
import { popularSkills, searchSkills } from './skillsSh.ts'
import { checkUpdate, clearUpdateCache } from './updates.ts'
import { languageFor } from './languages.ts'
import { isDir, isWithin } from './util.ts'

const PORT = Number(process.env.PORT || 5178)
const HOST = process.env.HOST || '127.0.0.1'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const MAX_FILE_BYTES = 1024 * 1024

let scanCache: Promise<ScanResult> | undefined

async function envRoots(): Promise<string[]> {
  const raw = process.env.SKILLS_MANAGER_ROOTS
  return raw ? raw.split(path.delimiter).map((s) => s.trim()).filter(Boolean) : []
}

async function allProjectRoots(): Promise<string[]> {
  const cfg = await loadConfig()
  const roots = [...new Set([...(await envRoots()), ...cfg.projectRoots].map((r) => path.resolve(r)))]
  return roots
}

function getScan(refresh = false): Promise<ScanResult> {
  if (!scanCache || refresh) {
    scanCache = allProjectRoots().then(scanSkills)
    scanCache.catch(() => (scanCache = undefined))
  }
  return scanCache
}

async function findSkill(id: string): Promise<Skill | undefined> {
  return (await getScan()).skills.find((s) => s.id === id)
}

const app = new Hono()

app.onError((err, c) => {
  if (err instanceof GithubError) return c.json({ error: err.message }, err.status === 404 ? 404 : 502)
  if ((err as { status?: number }).status === 409) return c.json({ error: err.message }, 409)
  console.error(err)
  return c.json({ error: err.message }, 500)
})

const isLocalHostname = (h: string) => h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')

// Mutating routes run commands. Refuse cross-site requests and DNS-rebound hostnames, which a page on
// another site could otherwise use to reach this server.
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD') return next()
  const host = c.req.header('host') ?? ''
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  const origin = c.req.header('origin')
  let sameOrigin = true
  if (origin) {
    try {
      sameOrigin = new URL(origin).host === host
    } catch {
      sameOrigin = false
    }
  }
  const site = c.req.header('sec-fetch-site')
  if (!isLocalHostname(hostname) || !sameOrigin || (site && site !== 'same-origin' && site !== 'none')) {
    return c.json({ error: 'Cross-origin request refused' }, 403)
  }
  return next()
})

app.get('/api/skills', async (c) => {
  const refresh = c.req.query('refresh') === '1'
  if (refresh) clearUpdateCache()
  return c.json(await getScan(refresh))
})

app.get('/api/skills/:id/file', async (c) => {
  const skill = await findSkill(c.req.param('id'))
  if (!skill) return c.json({ error: 'Unknown skill' }, 404)
  const rel = c.req.query('path') ?? 'SKILL.md'
  const abs = path.resolve(skill.realPath, rel)
  if (!isWithin(skill.realPath, abs)) return c.json({ error: 'Path escapes the skill directory' }, 400)
  let real: string
  try {
    real = await fs.realpath(abs)
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
  const st = await fs.stat(real)
  if (!st.isFile()) return c.json({ error: 'Not a file' }, 400)
  const fh = await fs.open(real, 'r')
  try {
    const len = Math.min(st.size, MAX_FILE_BYTES)
    const buf = Buffer.alloc(len)
    await fh.read(buf, 0, len, 0)
    const sample = buf.subarray(0, Math.min(len, 8000))
    const binary = sample.includes(0)
    const body: FileContent = {
      path: rel,
      content: binary ? '' : buf.toString('utf8'),
      size: st.size,
      language: languageFor(real),
      truncated: st.size > MAX_FILE_BYTES,
      binary,
    }
    return c.json(body)
  } finally {
    await fh.close()
  }
})

app.get('/api/updates', async (c) => {
  const scan = await getScan()
  const results = await Promise.all(scan.skills.map((s) => checkUpdate(s)))
  const map: Record<string, UpdateStatus> = {}
  for (const r of results) map[r.skillId] = r
  return c.json(map)
})

app.get('/api/updates/:id', async (c) => {
  const skill = await findSkill(c.req.param('id'))
  if (!skill) return c.json({ error: 'Unknown skill' }, 404)
  return c.json(await checkUpdate(skill))
})

app.post('/api/skills/:id/run', async (c) => {
  const skill = await findSkill(c.req.param('id'))
  if (!skill) return c.json({ error: 'Unknown skill' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as { command?: unknown }
  // Only commands this server generated for the skill can run.
  const cmd = [...skill.install.updateCommands, ...skill.install.removeCommands].find((x) => x.command === body.command)
  if (!cmd) return c.json({ error: 'Not one of this skill\'s commands' }, 400)
  const kind = skill.install.removeCommands.includes(cmd) ? 'remove' : 'update'
  const result = await runExclusive({ kind, skills: [skill.name], title: cmd.title }, [{ shell: { command: cmd.command } }])
  scanCache = undefined
  clearUpdateCache()
  return c.json(result)
})

app.get('/api/discover/search', async (c) => {
  const q = c.req.query('q') ?? ''
  return c.json(q.trim() ? await searchSkills(q) : await popularSkills())
})

app.get('/api/discover/repo', async (c) => {
  const ref = parseRepoInput(c.req.query('input') ?? '')
  if (!ref) return c.json({ error: 'Not a GitHub repository. Use owner/repo or a github.com URL.' }, 400)
  return c.json(await resolveRepo(ref, c.req.query('refresh') === '1'))
})

app.get('/api/discover/file', async (c) => {
  const { owner = '', repo = '', sha = '', path: filePath = '' } = c.req.query()
  return c.json(await remoteFile(owner, repo, sha, filePath))
})

app.post('/api/discover/install', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Partial<InstallRequest> & { dryRun?: boolean }
  const { owner, repo, sha, dirs, agents, scope } = body
  if (typeof owner !== 'string' || typeof repo !== 'string' || typeof sha !== 'string' || !Array.isArray(dirs) || !Array.isArray(agents) || !scope) {
    return c.json({ error: 'Malformed install request' }, 400)
  }
  const skills = dirs.map((d) => listedSkill(owner, repo, sha, String(d)))
  if (!skills.length || skills.some((s) => !s)) return c.json({ error: 'Unknown skill; reload the repository.' }, 400)
  if (scope.kind === 'project' && !(await allProjectRoots()).includes(path.resolve(scope.path))) {
    return c.json({ error: 'Project installs go into one of the configured project folders.' }, 400)
  }
  const req: InstallRequest = { owner, repo, sha, ref: typeof body.ref === 'string' ? body.ref : undefined, dirs: dirs.map(String), agents: agents.map(String), scope }
  let invocations
  try {
    invocations = installInvocations(req, skills as RemoteSkill[], listedSkills(owner, repo, sha))
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
  if (body.dryRun) return c.json({ ok: true, command: invocations.map(displayCommand).join('\n'), output: '' })
  // The CLI clones the ref, not a commit; refuse if it moved since the user read the files.
  if ((await headSha({ owner, repo, ref: req.ref })) !== sha) {
    return c.json({ error: 'The repository changed since you previewed it. Reload it and review the skills again.' }, 409)
  }
  const about = { kind: 'install' as const, skills: (skills as RemoteSkill[]).map((s) => s.name), title: `Install from ${owner}/${repo}` }
  const result = await runExclusive(about, invocations.map((inv) => ({ inv })))
  scanCache = undefined
  return c.json(result)
})

app.get('/api/log', async (c) => c.json({ entries: (await log.read()).reverse(), file: log.file }))

app.get('/api/config', async (c) => {
  const cfg = await loadConfig()
  return c.json({ ...cfg, envRoots: await envRoots(), configFile: configPath() })
})

app.put('/api/config', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { projectRoots?: unknown }
  const roots = Array.isArray(body.projectRoots) ? body.projectRoots.filter((r): r is string => typeof r === 'string') : []
  const resolved: string[] = []
  const invalid: string[] = []
  for (const r of roots) {
    const abs = path.resolve(r.replace(/^~(?=$|\/)/, process.env.HOME ?? ''))
    if (await isDir(abs)) resolved.push(abs)
    else invalid.push(r)
  }
  await saveConfig({ projectRoots: [...new Set(resolved)] })
  scanCache = undefined
  return c.json({ projectRoots: resolved, invalid })
})

const dist = path.join(ROOT, 'dist')
if (process.env.NODE_ENV === 'production' || (await isDir(dist))) {
  app.use('/*', serveStatic({ root: path.relative(process.cwd(), dist) || '.' }))
  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found' }, 404)
    const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8').catch(() => '')
    return html ? c.html(html) : c.text('Client not built. Run "pnpm build" first.', 503)
  })
}

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) => {
  console.log(`skills-manager API listening on http://${info.address}:${info.port}`)
  getScan().then((r) => console.log(`scanned ${r.skills.length} skills in ${r.durationMs}ms`)).catch((e) => console.error('initial scan failed', e))
})
