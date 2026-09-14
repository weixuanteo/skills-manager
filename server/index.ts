import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import type { FileContent, ScanResult, Skill, UpdateStatus } from '../shared/types.ts'
import { configPath, loadConfig, saveConfig } from './config.ts'
import { scanSkills } from './scanner.ts'
import { checkUpdate, clearUpdateCache } from './updates.ts'
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

const LANG_BY_EXT: Record<string, string> = {
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  ts: 'typescript', tsx: 'tsx', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', ini: 'ini',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift',
  c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', xml: 'xml', svg: 'xml', txt: 'plaintext',
  dockerfile: 'dockerfile', makefile: 'makefile', lua: 'lua', r: 'r', pl: 'perl',
}

function languageFor(file: string): string {
  const base = path.basename(file).toLowerCase()
  if (base === 'dockerfile') return 'dockerfile'
  if (base === 'makefile') return 'makefile'
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : ''
  return LANG_BY_EXT[ext] ?? 'plaintext'
}

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message }, 500)
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
