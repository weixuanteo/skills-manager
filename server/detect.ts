import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  ClaudePluginInfo,
  Command,
  GitInfo,
  InstallInfo,
  NpmInfo,
  SkillLocation,
  SkillsCliInfo,
} from '../shared/types.ts'
import { exists, findUp, isWithin, readJson, run, shellQuote, tildify } from './util.ts'

export interface DetectContext {
  home: string
  npmGlobalRoots: string[]
  /** lockfile path -> parsed lockfile (or null if unreadable) */
  lockCache: Map<string, SkillsLockfile | null>
  /** repoRoot -> git info (without subPath) */
  gitCache: Map<string, Omit<GitInfo, 'subPath'> | null>
  claudePlugins: ClaudePluginInfo[]
}

export interface SkillsLockfile {
  version?: number
  skills?: Record<string, Record<string, unknown>>
}

export async function createDetectContext(home: string): Promise<DetectContext> {
  const npmGlobalRoots: string[] = []
  const [npmRoot, pnpmRoot] = await Promise.all([
    run('npm', ['root', '-g'], { timeoutMs: 8000 }),
    run('pnpm', ['root', '-g'], { timeoutMs: 8000 }),
  ])
  for (const r of [npmRoot, pnpmRoot]) {
    const p = r.stdout.trim()
    if (r.ok && p) npmGlobalRoots.push(path.resolve(p))
  }
  return {
    home,
    npmGlobalRoots,
    lockCache: new Map(),
    gitCache: new Map(),
    claudePlugins: await loadClaudePlugins(home),
  }
}

async function loadClaudePlugins(home: string): Promise<ClaudePluginInfo[]> {
  const file = path.join(home, '.claude', 'plugins', 'installed_plugins.json')
  const data = await readJson<Record<string, unknown>>(file)
  const out: ClaudePluginInfo[] = []
  if (!data) return out
  const plugins = (data.plugins ?? data) as Record<string, unknown>
  if (!plugins || typeof plugins !== 'object') return out
  for (const [key, value] of Object.entries(plugins)) {
    const entries = Array.isArray(value) ? value : [value]
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const e = entry as Record<string, unknown>
      const installPath = typeof e.installPath === 'string' ? e.installPath : typeof e.path === 'string' ? e.path : undefined
      if (!installPath) continue
      const [plugin, marketplace] = key.includes('@') ? key.split('@') : [key, undefined]
      out.push({
        plugin,
        marketplace: marketplace ?? (typeof e.marketplace === 'string' ? e.marketplace : undefined),
        version: typeof e.version === 'string' ? e.version : undefined,
        installPath: path.resolve(installPath),
      })
    }
  }
  return out
}

// ---------- git ----------

async function gitInfoFor(repoRoot: string, ctx: DetectContext): Promise<Omit<GitInfo, 'subPath'> | null> {
  if (ctx.gitCache.has(repoRoot)) return ctx.gitCache.get(repoRoot)!
  const [remotes, branch, head, upstream] = await Promise.all([
    run('git', ['-C', repoRoot, 'remote']),
    run('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD']),
    run('git', ['-C', repoRoot, 'rev-parse', 'HEAD']),
    run('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
  ])
  if (!head.ok) {
    ctx.gitCache.set(repoRoot, null)
    return null
  }
  const remoteNames = remotes.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
  const up = upstream.ok ? upstream.stdout.trim() : undefined
  let remote = up?.includes('/') ? up.split('/')[0] : undefined
  if (!remote) remote = remoteNames.includes('origin') ? 'origin' : remoteNames[0]
  let remoteUrl: string | undefined
  if (remote) {
    const url = await run('git', ['-C', repoRoot, 'remote', 'get-url', remote])
    if (url.ok) remoteUrl = url.stdout.trim()
  }
  const info = {
    repoRoot,
    remote,
    remoteUrl,
    branch: branch.ok ? branch.stdout.trim() : undefined,
    head: head.stdout.trim(),
    upstream: up,
  }
  ctx.gitCache.set(repoRoot, info)
  return info
}

async function findGitRoot(start: string): Promise<string | undefined> {
  return findUp(start, async (dir) => exists(path.join(dir, '.git')))
}

// ---------- npm ----------

async function detectNpm(realPath: string, ctx: DetectContext): Promise<NpmInfo | undefined> {
  const segs = realPath.split(path.sep)
  const idx = segs.lastIndexOf('node_modules')
  if (idx === -1 || idx === segs.length - 1) return undefined
  let pkgSegs = [segs[idx + 1]]
  if (segs[idx + 1].startsWith('@')) {
    if (!segs[idx + 2]) return undefined
    pkgSegs = [segs[idx + 1], segs[idx + 2]]
  }
  const packageRoot = segs.slice(0, idx + 1 + pkgSegs.length).join(path.sep)
  const pkg = await readJson<{ name?: string; version?: string }>(path.join(packageRoot, 'package.json'))
  const packageName = pkg?.name ?? pkgSegs.join('/')
  const nmDir = segs.slice(0, idx).join(path.sep) || path.sep
  const global =
    ctx.npmGlobalRoots.some((g) => isWithin(g, packageRoot)) ||
    /\/(\.nvm|\.local\/share\/pnpm|\.local\/share\/fnm|\.volta|\.bun\/install\/global|\.yarn\/global|\.npm\/_npx)\//.test(realPath + '/')
  let packageManager: NpmInfo['packageManager'] = 'npm'
  let projectRoot: string | undefined
  if (global) {
    if (/\/pnpm\//.test(realPath)) packageManager = 'pnpm'
    else if (/\/\.bun\//.test(realPath)) packageManager = 'bun'
    else if (/\/\.yarn\//.test(realPath)) packageManager = 'yarn'
  } else {
    projectRoot = nmDir
    if (await exists(path.join(nmDir, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (await exists(path.join(nmDir, 'yarn.lock'))) packageManager = 'yarn'
    else if ((await exists(path.join(nmDir, 'bun.lock'))) || (await exists(path.join(nmDir, 'bun.lockb')))) packageManager = 'bun'
    else if (await exists(path.join(nmDir, '.pnpm'))) packageManager = 'pnpm'
  }
  return { packageName, packageRoot, installedVersion: pkg?.version, packageManager, global, projectRoot }
}

// ---------- Vercel `skills` CLI ----------

async function loadLock(file: string, ctx: DetectContext): Promise<SkillsLockfile | null> {
  if (ctx.lockCache.has(file)) return ctx.lockCache.get(file)!
  const data = (await readJson<SkillsLockfile>(file)) ?? null
  ctx.lockCache.set(file, data && typeof data === 'object' ? data : null)
  return ctx.lockCache.get(file)!
}

async function detectSkillsCli(realPath: string, locations: SkillLocation[], ctx: DetectContext): Promise<SkillsCliInfo | undefined> {
  // Candidate "agents dirs": any path segment ".agents" above the real path or above any location.
  const candidates = new Set<string>()
  const consider = (p: string) => {
    const m = /^(.*)\/\.agents\/skills(\/|$)/.exec(p)
    if (m) candidates.add(m[1] || path.sep)
  }
  consider(realPath)
  for (const l of locations) {
    consider(l.path)
    if (l.linkTarget) consider(l.linkTarget)
    consider(l.root)
  }
  candidates.add(ctx.home)
  const dirName = path.basename(realPath)
  for (const base of candidates) {
    const files = [
      path.join(base, 'skills-lock.json'),
      path.join(base, '.agents', 'skills-lock.json'),
      path.join(base, '.agents', '.skills-lock.json'),
      path.join(base, '.agents', 'skills', 'skills-lock.json'),
    ]
    for (const file of files) {
      const lock = await loadLock(file, ctx)
      if (!lock?.skills) continue
      let entry: Record<string, unknown> | undefined = lock.skills[dirName]
      if (!entry) {
        entry = Object.values(lock.skills).find((e) => {
          const sp = typeof e.skillPath === 'string' ? e.skillPath : ''
          return sp && path.basename(sp) === dirName
        })
      }
      if (!entry) continue
      const str = (k: string) => (typeof entry![k] === 'string' ? (entry![k] as string) : undefined)
      return {
        lockfile: file,
        source: str('source'),
        sourceType: str('sourceType'),
        sourceUrl: str('sourceUrl'),
        skillPath: str('skillPath'),
        installedAt: str('installedAt'),
        updatedAt: str('updatedAt'),
        hash: str('skillFolderHash') ?? str('computedHash') ?? str('hash') ?? str('commit'),
        global: base === ctx.home,
      }
    }
  }
  return undefined
}

// ---------- main ----------

export async function detectInstall(realPath: string, locations: SkillLocation[], ctx: DetectContext): Promise<InstallInfo> {
  const q = shellQuote
  const home = ctx.home
  const t = (p: string) => q(tildify(p, home))
  const symlinkLocs = locations.filter((l) => l.isSymlink)
  const dirLocs = locations.filter((l) => !l.isSymlink)

  const removeLinks: Command[] = symlinkLocs.map((l) => ({
    title: `Unlink from ${l.agent} (${tildify(l.path, home)})`,
    command: `rm ${t(l.path)}`,
    note: 'Removes only the symlink. The target directory is left untouched.',
  }))

  // 1. Codex built-in system skills
  if (/\/\.codex\/skills\/\.system(\/|$)/.test(realPath) || locations.some((l) => /\/\.codex\/skills\/\.system\//.test(l.path))) {
    return {
      method: 'codex-system',
      label: 'Codex built-in',
      summary: 'Bundled with the Codex CLI and re-created on upgrade. Update Codex itself to get newer versions; deleting it is not recommended.',
      removeCommands: [
        ...removeLinks,
        {
          title: 'Delete anyway (Codex will restore it on next launch)',
          command: `rm -rf ${t(realPath)}`,
          danger: true,
          note: 'Not recommended: Codex re-creates the .system directory automatically.',
        },
      ],
      updateCommands: [
        { title: 'Update Codex CLI (npm)', command: 'npm install -g @openai/codex@latest' },
        { title: 'Update Codex CLI (Homebrew)', command: 'brew upgrade codex' },
      ],
      updateCheckable: false,
      updateCheckHint: 'Managed by the Codex CLI. Upgrade Codex to refresh its built-in skills.',
    }
  }

  // 2. Claude Code plugins
  const plugin = ctx.claudePlugins.find((p) => isWithin(p.installPath, realPath))
  if (plugin || isWithin(path.join(home, '.claude', 'plugins'), realPath)) {
    const ref = plugin ? `${plugin.plugin}${plugin.marketplace ? '@' + plugin.marketplace : ''}` : path.basename(path.dirname(path.dirname(realPath)))
    return {
      method: 'claude-plugin',
      label: 'Claude Code plugin',
      summary: plugin
        ? `Installed as part of the "${plugin.plugin}" plugin${plugin.marketplace ? ` from the ${plugin.marketplace} marketplace` : ''}${plugin.version ? ` (v${plugin.version})` : ''}. Manage it through the claude plugin commands.`
        : 'Lives inside the Claude Code plugins directory. Manage it through the claude plugin commands.',
      claudePlugin: plugin ?? { plugin: ref, installPath: realPath },
      removeCommands: [
        ...removeLinks,
        { title: 'Uninstall the plugin', command: `claude plugin uninstall ${q(ref)}`, note: 'Removes the whole plugin, including all of its skills.' },
        { title: 'Disable without uninstalling', command: `claude plugin disable ${q(ref)}` },
      ],
      updateCommands: [
        { title: 'Update the plugin', command: `claude plugin update ${q(ref)}` },
        ...(plugin?.marketplace ? [{ title: 'Refresh the marketplace first', command: `claude plugin marketplace update ${q(plugin.marketplace)}` }] : []),
      ],
      updateCheckable: false,
      updateCheckHint: 'Run "claude plugin marketplace update" then "claude plugin list" to see available plugin versions.',
    }
  }

  // 3. npm / pnpm / yarn / bun packages
  const npm = await detectNpm(realPath, ctx)
  if (npm) {
    const pm = npm.packageManager
    const isNpx = /\/\.npm\/_npx\//.test(realPath)
    const pkg = q(npm.packageName)
    const g = npm.global
    const uninstall: Record<NpmInfo['packageManager'], string> = {
      npm: `npm uninstall ${g ? '-g ' : ''}${pkg}`,
      pnpm: `pnpm remove ${g ? '-g ' : ''}${pkg}`,
      yarn: g ? `yarn global remove ${pkg}` : `yarn remove ${pkg}`,
      bun: `bun remove ${g ? '-g ' : ''}${pkg}`,
    }
    const upgrade: Record<NpmInfo['packageManager'], string> = {
      npm: `npm install ${g ? '-g ' : ''}${pkg}@latest`,
      pnpm: g ? `pnpm add -g ${pkg}@latest` : `pnpm update ${pkg} --latest`,
      yarn: g ? `yarn global upgrade ${pkg} --latest` : `yarn upgrade ${pkg} --latest`,
      bun: `bun ${g ? 'add -g' : 'update'} ${pkg}@latest`,
    }
    const cd = !g && npm.projectRoot ? `cd ${t(npm.projectRoot)} && ` : ''
    const removeCommands: Command[] = [...removeLinks]
    if (isNpx) {
      removeCommands.push({
        title: 'Clear this npx cache entry',
        command: `rm -rf ${t(realPath.slice(0, realPath.indexOf('/_npx/') + 6) + realPath.slice(realPath.indexOf('/_npx/') + 6).split('/')[0])}`,
        note: 'The package was fetched by npx on demand; it will be re-downloaded the next time you run it.',
      })
    } else {
      removeCommands.push({
        title: `Uninstall with ${pm}${g ? ' (global)' : ''}`,
        command: `${cd}${uninstall[pm]}`,
        note: 'Preferred: removes the package and its lockfile entry cleanly.',
      })
    }
    for (const l of dirLocs) {
      if (!isWithin(npm.packageRoot, l.path))
        removeCommands.push({ title: `Remove copy at ${tildify(l.path, home)}`, command: `rm -rf ${t(l.path)}`, danger: true })
    }
    return {
      method: 'npm',
      label: isNpx ? 'npx cache' : `${pm} package${g ? ' (global)' : ''}`,
      summary: `Ships inside the ${npm.packageName}${npm.installedVersion ? '@' + npm.installedVersion : ''} package${g ? ' installed globally' : npm.projectRoot ? ` installed in ${tildify(npm.projectRoot, home)}` : ''}. Use the package manager to remove or update it.`,
      npm,
      removeCommands,
      updateCommands: isNpx
        ? [{ title: 'Fetch the latest with npx', command: `npx ${pkg}@latest --help`, note: 'npx caches a version; forcing @latest refreshes it.' }]
        : [{ title: `Upgrade with ${pm}`, command: `${cd}${upgrade[pm]}` }],
      updateCheckable: true,
      updateCheckHint: 'Compares the installed version with the latest on the npm registry.',
    }
  }

  // 4. Vercel `skills` CLI (npx skills add ...)
  const cli = await detectSkillsCli(realPath, locations, ctx)
  if (cli) {
    const name = path.basename(realPath)
    const gflag = cli.global ? ' -g' : ''
    const cd = !cli.global ? `cd ${t(path.dirname(cli.lockfile))} && ` : ''
    return {
      method: 'skills-cli',
      label: 'skills CLI',
      summary: `Installed with the "skills" CLI from ${cli.source ?? cli.sourceUrl ?? 'a remote source'}${cli.skillPath ? ` (${cli.skillPath})` : ''}. It is tracked in ${tildify(cli.lockfile, home)}.`,
      skillsCli: cli,
      removeCommands: [
        { title: 'Remove with the skills CLI', command: `${cd}npx skills remove ${q(name)}${gflag}`, note: 'Preferred: removes the directory, all agent symlinks and the lockfile entry.' },
        ...removeLinks,
        { title: 'Delete the directory manually', command: `rm -rf ${t(realPath)}`, danger: true, note: 'Leaves a stale entry in skills-lock.json.' },
      ],
      updateCommands: [
        { title: 'Update this skill', command: `${cd}npx skills update ${q(name)}${gflag}` },
        { title: 'Check all skills for updates', command: `${cd}npx skills check${gflag}` },
        { title: 'Update all skills', command: `${cd}npx skills update${gflag}` },
      ],
      updateCheckable: !!(cli.source || cli.sourceUrl),
      updateCheckHint: 'Compares the install time recorded in skills-lock.json with the latest upstream commit touching the skill.',
    }
  }

  // 5. git
  const repoRoot = await findGitRoot(realPath)
  const gitBase = repoRoot ? await gitInfoFor(repoRoot, ctx) : null
  if (repoRoot && gitBase) {
    const subPath = path.relative(repoRoot, realPath)
    const git: GitInfo = { ...gitBase, subPath }
    const pull: Command[] = gitBase.remote
      ? [
          { title: 'Pull the latest changes', command: `git -C ${t(repoRoot)} pull --ff-only` },
          { title: 'Inspect incoming changes first', command: `git -C ${t(repoRoot)} fetch && git -C ${t(repoRoot)} log --oneline HEAD..@{u}` },
        ]
      : []
    const where = `${tildify(repoRoot, home)}${gitBase.remoteUrl ? ` (${gitBase.remoteUrl})` : ''}`
    if (subPath === '' && dirLocs.length > 0) {
      // Cloned straight into a skills directory.
      return {
        method: 'git-clone',
        label: 'git clone',
        summary: `A git repository cloned directly into the skills directory${gitBase.remoteUrl ? `, tracking ${gitBase.remoteUrl}` : ''}. Pull to update, delete the directory to remove.`,
        git,
        removeCommands: [
          ...removeLinks,
          ...dirLocs.map((l) => ({ title: `Delete clone at ${tildify(l.path, home)}`, command: `rm -rf ${t(l.path)}`, danger: true })),
        ],
        updateCommands: pull,
        updateCheckable: !!gitBase.remote && !!gitBase.branch && gitBase.branch !== 'HEAD',
        updateCheckHint: 'Compares the local HEAD with the remote branch via git ls-remote (no fetch).',
      }
    }
    if (symlinkLocs.length > 0) {
      return {
        method: 'git-symlink',
        label: 'symlink → git repo',
        summary: `Symlinked from a local checkout of ${where}${subPath ? `, subdirectory ${subPath}` : ''}. Pull in that repo to update; remove the symlink to uninstall while keeping the checkout.`,
        git,
        removeCommands: [
          ...removeLinks,
          {
            title: subPath ? 'Also delete the source directory inside the repo' : 'Also delete the whole checkout',
            command: `rm -rf ${t(realPath)}`,
            danger: true,
            note: subPath ? 'This modifies the working tree of the source repository.' : 'This removes the entire local clone.',
          },
        ],
        updateCommands: pull,
        updateCheckable: !!gitBase.remote && !!gitBase.branch && gitBase.branch !== 'HEAD',
        updateCheckHint: 'Compares the local HEAD of the source repo with its remote branch via git ls-remote (no fetch).',
      }
    }
    // Plain directory that happens to live inside a git repo (e.g. project-level skill committed to the project).
    return {
      method: 'manual',
      label: 'in-repo directory',
      summary: `A regular directory tracked inside the git repository at ${where}${subPath ? ` (${subPath})` : ''}. Edit it like any other file in that repo.`,
      git,
      removeCommands: [
        ...removeLinks,
        ...(subPath
          ? [{ title: 'Remove from the repository (staged)', command: `git -C ${t(repoRoot)} rm -r ${q(subPath)}`, danger: true }]
          : []),
        ...dirLocs.map((l) => ({ title: `Delete ${tildify(l.path, home)}`, command: `rm -rf ${t(l.path)}`, danger: true })),
      ],
      updateCommands: pull,
      updateCheckable: !!gitBase.remote && !!gitBase.branch && gitBase.branch !== 'HEAD' && !!gitBase.upstream,
      updateCheckHint: 'Compares the repo HEAD with its upstream branch via git ls-remote (no fetch).',
    }
  }

  // 6. plain symlink to somewhere outside git
  if (symlinkLocs.length > 0 && dirLocs.length === 0) {
    return {
      method: 'symlink',
      label: 'symlink',
      summary: `A symlink pointing at ${tildify(realPath, home)}. Remove the link to uninstall; the target stays where it is.`,
      removeCommands: [
        ...removeLinks,
        { title: 'Also delete the target directory', command: `rm -rf ${t(realPath)}`, danger: true },
      ],
      updateCommands: [],
      updateCheckable: false,
      updateCheckHint: 'No package manager or git remote found for the link target, so there is nothing to compare against.',
    }
  }

  // 7. manual copy
  return {
    method: 'manual',
    label: 'manual copy',
    summary: 'A plain directory with no package manager, lockfile or git metadata. It was most likely copied in by hand or created locally.',
    removeCommands: [
      ...removeLinks,
      ...dirLocs.map((l) => ({ title: `Delete ${tildify(l.path, home)}`, command: `rm -rf ${t(l.path)}`, danger: true })),
    ],
    updateCommands: [],
    updateCheckable: false,
    updateCheckHint: 'No source of truth to compare against. Re-copy the skill from wherever it came from.',
  }
}
