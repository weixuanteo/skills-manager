import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { InstallRequest, RemoteSkill } from '../shared/types.ts'
import { displayCommand, installInvocations } from './actions.ts'
import { findLockEntry } from './detect.ts'
import { parseRepoInput } from './github.ts'

describe('parseRepoInput', () => {
  test('accepts shorthand, URLs and subdirectory links', () => {
    assert.deepEqual(parseRepoInput('mattpocock/skills'), { owner: 'mattpocock', repo: 'skills', ref: undefined, subpath: undefined })
    assert.deepEqual(parseRepoInput('https://github.com/cursor/plugins/tree/main/pstack/skills'), { owner: 'cursor', repo: 'plugins', ref: 'main', subpath: 'pstack/skills' })
    assert.deepEqual(parseRepoInput('github.com/o/r.git#v2'), { owner: 'o', repo: 'r', ref: 'v2', subpath: undefined })
    assert.deepEqual(parseRepoInput('git@github.com:o/r.git'), { owner: 'o', repo: 'r', ref: undefined, subpath: undefined })
    assert.deepEqual(parseRepoInput('https://github.com/o/r/blob/main/skills/tdd/SKILL.md'), { owner: 'o', repo: 'r', ref: 'main', subpath: 'skills/tdd' })
  })

  test('rejects anything that is not a GitHub repository', () => {
    for (const bad of ['react', 'https://gitlab.com/o/r', 'o/r/../../etc', 'o/r/tree', 'o$/r', 'file:///etc/passwd']) assert.equal(parseRepoInput(bad), undefined, bad)
  })
})

const skill = (dir: string, name = dir.slice(dir.lastIndexOf('/') + 1)): RemoteSkill => ({ name, description: 'd', dir, frontmatter: {}, files: [], fileCount: 1, totalSize: 1, executables: [] })
const req = (over: Partial<InstallRequest> = {}): InstallRequest => ({ owner: 'o', repo: 'r', sha: 'abc', dirs: [], agents: ['claude', 'codex'], scope: { kind: 'global' }, ...over })

describe('installInvocations', () => {
  test('runs one add per parent directory, selecting skills by frontmatter name', () => {
    const invs = installInvocations(req(), [skill('skills/eng/tdd'), skill('skills/prod/grill-me'), skill('skills/eng/make-bot-ui', 'Make Bot UI')])
    assert.deepEqual(
      invs.map(displayCommand),
      [
        "npx -y skills add o/r/skills/eng -s tdd 'Make Bot UI' -a claude-code codex -g -y",
        'npx -y skills add o/r/skills/prod -s grill-me -a claude-code codex -g -y',
      ],
    )
  })

  test('passes the ref as a fragment so branch names with slashes survive, and installs project scope from the project directory', () => {
    const [inv] = installInvocations(req({ ref: 'feature/x', scope: { kind: 'project', path: '/work/app' } }), [skill('skills/tdd')])
    assert.equal(displayCommand(inv), "cd /work/app && npx -y skills add 'o/r/skills#feature/x' -s tdd -a claude-code codex -y")
  })

  test('points at the skill directory when a sibling shares its name', () => {
    const listed = [skill('skills/a', 'review'), skill('skills/b', 'review'), skill('skills/c')]
    const invs = installInvocations(req(), [listed[1], listed[2]], listed)
    assert.deepEqual(invs.map((i) => i.args[3]), ['o/r/skills/b', 'o/r/skills'])
  })

  test('refuses two picks that would install into the same directory', () => {
    assert.throws(() => installInvocations(req(), [skill('x/review'), skill('y/Review')]), /both named/)
  })

  test('refuses names the CLI would read as flags or wildcards', () => {
    for (const name of ['--all', '-y', '*']) assert.throws(() => installInvocations(req(), [skill('skills/x', name)]), /Refusing/, name)
  })

  test('requires a known agent', () => {
    assert.throws(() => installInvocations(req({ agents: ['nope'] }), [skill('tdd')]), /at least one agent/)
  })
})

describe('findLockEntry', () => {
  test('prefers a key match over another entry whose upstream directory has the same name', () => {
    const skills = { bar: { skillPath: 'skills/foo/SKILL.md' }, foo: { skillPath: 'skills/foo-v2/SKILL.md' } }
    assert.equal(findLockEntry(skills, 'foo')?.[0], 'foo')
  })

  test('matches display-name keys by the directory the CLI installs them under', () => {
    assert.equal(findLockEntry({ 'Make Bot UI': { skillPath: 'pstack/skills/ui/SKILL.md' } }, 'make-bot-ui')?.[0], 'Make Bot UI')
  })

  test('falls back to the upstream directory name', () => {
    assert.equal(findLockEntry({ renamed: { skillPath: 'skills/tdd/SKILL.md' } }, 'tdd')?.[0], 'renamed')
    assert.equal(findLockEntry({ other: { skillPath: 'skills/x/SKILL.md' } }, 'tdd'), undefined)
  })
})
