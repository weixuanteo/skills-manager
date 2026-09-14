import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentId, FileEntry, ScanResult, ScanRoot, Scope, Skill, SkillLocation } from '../shared/types.ts'
import { AGENTS } from './agents.ts'
import { createDetectContext, detectInstall } from './detect.ts'
import { exists, hashId, isDir, parseFrontmatter, tildify } from './util.ts'

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.cache'])
const MAX_TREE_ENTRIES = 600
const MAX_TREE_DEPTH = 5

interface RootDef {
  path: string
  agent: AgentId
  scope: Scope
  label: string
}

async function findSkillFile(dir: string): Promise<string | undefined> {
  for (const name of ['SKILL.md', 'skill.md', 'Skill.md']) {
    const p = path.join(dir, name)
    if (await exists(p)) return p
  }
  return undefined
}

async function listSkillDirs(root: string, depth = 0): Promise<{ dir: string; skillFile: string }[]> {
  const out: { dir: string; skillFile: string }[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const full = path.join(root, e.name)
    if (!(await isDir(full))) continue // also skips broken symlinks
    const skillFile = await findSkillFile(full)
    if (skillFile) {
      out.push({ dir: full, skillFile })
    } else if (depth < 2) {
      out.push(...(await listSkillDirs(full, depth + 1)))
    }
  }
  return out
}

async function buildTree(dir: string, rel = '', depth = 0, budget = { n: 0 }): Promise<FileEntry[]> {
  if (depth > MAX_TREE_DEPTH || budget.n > MAX_TREE_ENTRIES) return []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  const out: FileEntry[] = []
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    if (budget.n++ > MAX_TREE_ENTRIES) break
    const full = path.join(dir, e.name)
    const relPath = rel ? `${rel}/${e.name}` : e.name
    try {
      const st = await fs.stat(full)
      if (st.isDirectory()) {
        out.push({ name: e.name, path: relPath, type: 'dir', children: await buildTree(full, relPath, depth + 1, budget) })
      } else if (st.isFile()) {
        out.push({ name: e.name, path: relPath, type: 'file', size: st.size })
      }
    } catch {
      /* ignore unreadable */
    }
  }
  out.sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1))
  return out
}

function flatten(tree: FileEntry[]): FileEntry[] {
  const out: FileEntry[] = []
  for (const e of tree) {
    out.push(e)
    if (e.children) out.push(...flatten(e.children))
  }
  return out
}

async function claudePluginRoots(home: string): Promise<RootDef[]> {
  const base = path.join(home, '.claude', 'plugins')
  if (!(await isDir(base))) return []
  const roots: RootDef[] = []
  const seen = new Set<string>()
  const add = (p: string, label: string) => {
    if (!seen.has(p)) {
      seen.add(p)
      roots.push({ path: p, agent: 'claude-plugin', scope: 'global', label })
    }
  }
  // Walk cache/repos/marketplaces up to 4 levels looking for a "skills" dir.
  const walk = async (dir: string, depth: number) => {
    if (depth > 4) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || SKIP_DIRS.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.name === 'skills') add(full, `Claude plugin: ${path.basename(dir)}`)
      else await walk(full, depth + 1)
    }
  }
  await walk(base, 0)
  return roots
}

export async function scanSkills(projectRoots: string[]): Promise<ScanResult> {
  const started = Date.now()
  const home = os.homedir()
  const ctx = await createDetectContext(home)

  const rootDefs: RootDef[] = []
  for (const a of AGENTS) {
    if (a.projectOnly) continue
    for (const d of a.dirs) rootDefs.push({ path: path.join(home, d), agent: a.id, scope: 'global', label: a.label })
  }
  rootDefs.push(...(await claudePluginRoots(home)))
  for (const pr of projectRoots) {
    for (const a of AGENTS) {
      for (const d of a.dirs) rootDefs.push({ path: path.join(pr, d), agent: a.id, scope: 'project', label: `${a.label} · ${tildify(pr, home)}` })
    }
  }

  const byReal = new Map<string, { skillFile: string; locations: SkillLocation[] }>()
  const roots: ScanRoot[] = []
  const issues: string[] = []

  for (const r of rootDefs) {
    const present = await isDir(r.path)
    let count = 0
    if (present) {
      const found = await listSkillDirs(r.path)
      for (const f of found) {
        count++
        let isSymlink = false
        let linkTarget: string | undefined
        try {
          const lst = await fs.lstat(f.dir)
          isSymlink = lst.isSymbolicLink()
          if (isSymlink) linkTarget = await fs.readlink(f.dir)
        } catch {
          /* ignore */
        }
        // Also treat a directory whose ancestor within the root is a symlink as symlinked.
        const realPath = await fs.realpath(f.dir)
        if (!isSymlink && realPath !== f.dir) {
          isSymlink = true
          linkTarget = realPath
        }
        const loc: SkillLocation = {
          path: f.dir,
          agent: r.agent,
          scope: r.scope,
          isSymlink,
          linkTarget: linkTarget ? path.resolve(path.dirname(f.dir), linkTarget) : undefined,
          root: r.path,
        }
        const entry = byReal.get(realPath)
        if (entry) entry.locations.push(loc)
        else byReal.set(realPath, { skillFile: await fs.realpath(f.skillFile), locations: [loc] })
      }
      // Report broken symlinks in this root.
      try {
        for (const e of await fs.readdir(r.path, { withFileTypes: true })) {
          if (e.isSymbolicLink()) {
            const full = path.join(r.path, e.name)
            if (!(await exists(full))) issues.push(`Broken symlink: ${tildify(full, home)} → ${await fs.readlink(full)}`)
          }
        }
      } catch {
        /* ignore */
      }
    }
    roots.push({ path: r.path, agent: r.agent, scope: r.scope, exists: present, skillCount: count, label: r.label })
  }

  const skills: Skill[] = []
  await Promise.all(
    [...byReal.entries()].map(async ([realPath, { skillFile, locations }]) => {
      let raw = ''
      try {
        raw = await fs.readFile(skillFile, 'utf8')
      } catch {
        /* ignore */
      }
      const fm = parseFrontmatter(raw)
      const dirName = path.basename(realPath)
      const name = typeof fm.data.name === 'string' && fm.data.name.trim() ? fm.data.name.trim() : dirName
      const description = typeof fm.data.description === 'string' ? fm.data.description.trim() : undefined
      const files = await buildTree(realPath)
      const flat = flatten(files)
      const fileCount = flat.filter((f) => f.type === 'file').length
      const totalSize = flat.reduce((s, f) => s + (f.size ?? 0), 0)
      let lastModified = new Date(0)
      try {
        lastModified = (await fs.stat(skillFile)).mtime
      } catch {
        /* ignore */
      }
      const warnings: string[] = []
      if (!raw) warnings.push('SKILL.md could not be read.')
      if (!description) warnings.push('SKILL.md has no description in its frontmatter.')
      if (typeof fm.data.name === 'string' && fm.data.name.trim() && fm.data.name.trim() !== dirName)
        warnings.push(`Frontmatter name "${fm.data.name}" differs from directory name "${dirName}".`)
      if (Object.keys(fm.data).length === 0 && raw) warnings.push('SKILL.md has no YAML frontmatter.')

      const install = await detectInstall(realPath, locations, ctx)
      const agents = [...new Set(locations.map((l) => l.agent))]
      const scopes = [...new Set(locations.map((l) => l.scope))]
      skills.push({
        id: hashId(realPath),
        name,
        description,
        frontmatter: fm.data,
        realPath,
        skillFile,
        locations,
        agents,
        scopes,
        files,
        fileCount,
        totalSize,
        lastModified: lastModified.toISOString(),
        install,
        warnings,
      })
    }),
  )
  skills.sort((a, b) => a.name.localeCompare(b.name))

  return {
    skills,
    roots,
    projectRoots,
    home,
    issues,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  }
}
