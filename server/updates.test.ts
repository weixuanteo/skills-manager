import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, mock, test } from 'node:test'
import type { InstallInfo, Skill } from '../shared/types.ts'
import { checkUpdate, clearUpdateCache } from './updates.ts'

function skill(id: string, install: Partial<InstallInfo> & Pick<InstallInfo, 'method'>): Skill {
  return {
    id,
    name: id,
    frontmatter: {},
    realPath: `/tmp/${id}`,
    skillFile: `/tmp/${id}/SKILL.md`,
    locations: [],
    agents: ['universal'],
    scopes: ['global'],
    files: [],
    fileCount: 1,
    totalSize: 1,
    lastModified: '2026-01-01T00:00:00Z',
    warnings: [],
    install: { label: '', summary: '', removeCommands: [], updateCommands: [], updateCheckable: true, ...install },
  }
}

function npmSkill(id: string, packageName: string, installedVersion?: string): Skill {
  return skill(id, { method: 'npm', npm: { packageName, packageRoot: `/tmp/${id}`, installedVersion, packageManager: 'npm', global: true } })
}

// `npm view` is answered by a shim placed first on PATH: it logs its arguments and prints $NPM_SHIM_STDOUT.
const shimDir = mkdtempSync(path.join(tmpdir(), 'npm-shim-'))
const shimLog = path.join(shimDir, 'calls.log')
writeFileSync(path.join(shimDir, 'npm'), `#!/bin/sh\necho "$@" >> "${shimLog}"\nprintf '%s\\n' "$NPM_SHIM_STDOUT"\n`)
chmodSync(path.join(shimDir, 'npm'), 0o755)
const npmCalls = () => {
  try {
    return readFileSync(shimLog, 'utf8').trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

describe('npm update checks', () => {
  const originalPath = process.env.PATH
  beforeEach(() => {
    clearUpdateCache()
    writeFileSync(shimLog, '')
    process.env.PATH = `${shimDir}${path.delimiter}${originalPath}`
  })
  afterEach(() => {
    process.env.PATH = originalPath
    delete process.env.NPM_SHIM_STDOUT
  })

  test('two installs of one package share a single registry lookup but get their own status', async () => {
    process.env.NPM_SHIM_STDOUT = '"2.0.0"'
    const [older, current] = await Promise.all([checkUpdate(npmSkill('a', 'shared-pkg', '1.0.0')), checkUpdate(npmSkill('b', 'shared-pkg', '2.0.0'))])
    assert.equal(npmCalls().length, 1)
    assert.equal(older.state, 'update-available')
    assert.equal(older.current, '1.0.0')
    assert.equal(current.state, 'up-to-date')
    assert.equal(current.current, '2.0.0')
    // A third check within the TTL is served from the cache and still gets its own status.
    const third = await checkUpdate(npmSkill('c', 'shared-pkg', '3.0.0'))
    assert.equal(npmCalls().length, 1)
    assert.equal(third.state, 'local-ahead')
  })

  test('registry errors are reported for every install of the package', async () => {
    process.env.PATH = `/nonexistent-dir`
    const r = await checkUpdate(npmSkill('a', 'missing-pkg', '1.0.0'))
    assert.equal(r.state, 'error')
    assert.match(r.message ?? '', /npm view failed/)
  })

  const cases: { installed: string; latest: string; state: string }[] = [
    { installed: '1.2.3', latest: '1.3.0', state: 'update-available' },
    { installed: '1.0.0-beta.1', latest: '1.0.0', state: 'update-available' },
    { installed: '1.0.0+build.1', latest: '1.0.0', state: 'up-to-date' },
    { installed: 'v1.0.0', latest: '1.0.0', state: 'up-to-date' },
    { installed: 'not-a-version', latest: '1.0.0', state: 'unknown' },
  ]
  for (const c of cases) {
    test(`installed ${c.installed} vs latest ${c.latest} is ${c.state}`, async () => {
      process.env.NPM_SHIM_STDOUT = JSON.stringify(c.latest)
      const r = await checkUpdate(npmSkill('a', `pkg-${c.installed}`, c.installed))
      assert.equal(r.state, c.state)
      assert.equal(r.current, c.installed)
      assert.equal(r.latest, c.latest)
    })
  }
})

describe('skills CLI update checks', () => {
  beforeEach(() => clearUpdateCache())
  afterEach(() => mock.restoreAll())

  function cliSkill(id: string, installedAt: string): Skill {
    return skill(id, {
      method: 'skills-cli',
      skillsCli: { lockfile: '/tmp/skills-lock.json', source: 'example/repo', skillPath: 'skills/example', installedAt, global: true },
    })
  }

  test('two installs of one upstream share a single GitHub request but get their own status', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      Response.json([{ sha: 'abcdef1234567890', commit: { committer: { date: '2026-01-15T00:00:00Z' } } }]),
    )
    const [before, after] = await Promise.all([checkUpdate(cliSkill('a', '2026-01-01T00:00:00Z')), checkUpdate(cliSkill('b', '2026-02-01T00:00:00Z'))])
    assert.equal(fetchMock.mock.callCount(), 1)
    const url = new URL(String(fetchMock.mock.calls[0].arguments[0]))
    assert.equal(url.pathname, '/repos/example/repo/commits')
    assert.equal(url.searchParams.get('path'), 'skills/example')
    assert.equal(before.state, 'update-available')
    assert.equal(before.current, '2026-01-01')
    assert.equal(after.state, 'up-to-date')
    assert.equal(after.current, '2026-02-01')
    assert.equal(after.latest, 'abcdef1 (2026-01-15)')
  })

  test('GitHub errors are reported for every install of the upstream', async () => {
    mock.method(globalThis, 'fetch', async () => new Response('', { status: 403 }))
    const r = await checkUpdate(cliSkill('a', '2026-01-01T00:00:00Z'))
    assert.equal(r.state, 'error')
    assert.match(r.message ?? '', /403 \(rate limited\?\)/)
  })
})
