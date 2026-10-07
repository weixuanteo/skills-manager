import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { listSkillDirs, resolveSkillDir } from './scanner.ts'

describe('scanning a skills root', () => {
  let tmp: string
  const write = async (rel: string) => {
    await fs.mkdir(path.join(tmp, rel), { recursive: true })
    await fs.writeFile(path.join(tmp, rel, 'SKILL.md'), '---\nname: x\n---\n')
  }
  const scan = async (root: string) => {
    const realRoot = await fs.realpath(root)
    const found = await listSkillDirs(root)
    return Promise.all(found.map(async (f) => ({ rel: path.relative(root, f.dir), ...(await resolveSkillDir(f.dir, root, realRoot)) })))
  }

  before(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'scanner-test-')))
    await write('real/skills/real-skill')
    await write('real/skills/.trash/123/real-skill')
    await write('real/skills/synced/bucket/.staging/x')
    await write('real/skills/synced/bucket/other')
    await write('real/skills/.system/sys-skill')
    await write('outside/linked-skill')
    await fs.symlink(path.join(tmp, 'outside/linked-skill'), path.join(tmp, 'real/skills/linked'))
    await fs.symlink(path.join(tmp, 'real'), path.join(tmp, 'alias'))
  })
  after(() => fs.rm(tmp, { recursive: true, force: true }))

  test('skips Claude Code scratch folders but keeps .system and synced skills', async () => {
    const found = await scan(path.join(tmp, 'real/skills'))
    assert.deepEqual(found.map((f) => f.rel).sort(), ['.system/sys-skill', 'linked', 'real-skill', 'synced/bucket/other'])
  })

  test('flags only symlinks at or below the root', async () => {
    const found = await scan(path.join(tmp, 'real/skills'))
    const by = (rel: string) => found.find((f) => f.rel === rel)!
    assert.equal(by('real-skill').isSymlink, false)
    assert.equal(by('real-skill').linkTarget, undefined)
    assert.equal(by('linked').isSymlink, true)
    assert.equal(by('linked').linkTarget, path.join(tmp, 'outside/linked-skill'))
  })

  test('ignores a symlinked parent above the root', async () => {
    const found = await scan(path.join(tmp, 'alias/skills'))
    const real = found.find((f) => f.rel === 'real-skill')!
    assert.equal(real.isSymlink, false)
    assert.equal(real.realPath, path.join(tmp, 'real/skills/real-skill'))
    assert.equal(found.find((f) => f.rel === 'linked')!.isSymlink, true)
  })
})
