import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, test } from 'node:test'
import type { LogEntry } from '../shared/types.ts'

// The log lives next to the config file, so point the config directory somewhere disposable before loading it.
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-manager-log-'))
process.env.XDG_CONFIG_HOME = dir
const { runExclusive } = await import('./actions.ts')
const { commandLog, log } = await import('./commandLog.ts')

const entry = (id: string): LogEntry => ({ id, kind: 'remove', skills: ['tdd'], title: 't', ok: true, command: 'true', output: '', startedAt: '', durationMs: 0 })

describe('runExclusive', () => {
  test('stops at the first failing command and logs the run', async () => {
    const run = await runExclusive({ kind: 'update', skills: ['tdd'], title: 'Update this skill' }, [
      { shell: { command: 'echo one' } },
      { shell: { command: 'exit 3' } },
      { shell: { command: 'echo never' } },
    ])
    assert.equal(run.ok, false)
    assert.equal(run.command, 'echo one\nexit 3')
    assert.match(run.output, /^\$ echo one\none\n\$ exit 3\n\nExited with code 3\.\n$/)
    assert.deepEqual((await log.read()).at(-1), run)
  })

  test('keeps the end of long output, where failures show up', async () => {
    const run = await runExclusive({ kind: 'install', skills: ['tdd'], title: 't' }, [{ shell: { command: "head -c 300000 /dev/zero | tr '\\0' x; echo; echo the-end" } }])
    assert.match(run.output, /^\$ head .*\n\[earlier output omitted\]\nx+\nthe-end\n$/)
    const logged = (await log.read()).at(-1)!
    assert.ok(logged.output.startsWith('[earlier output omitted]\n'))
    assert.ok(logged.output.endsWith('the-end\n'))
    assert.ok(logged.output.length < 33 * 1024)
  })
})

describe('commandLog', () => {
  test('keeps the newest 200 entries and drops a damaged line', async () => {
    const file = path.join(dir, 'trim.jsonl')
    const l = commandLog(file)
    for (let i = 0; i < 200; i++) await l.append(entry(String(i)))
    await fs.appendFile(file, '{"id":"x","kin')
    await l.append(entry('200'))
    const ids = (await l.read()).map((e) => e.id)
    assert.equal(ids.length, 200)
    assert.deepEqual([ids[0], ids.at(-1)], ['1', '200'])
  })

  test('leaves the file alone when it cannot be read', async () => {
    const file = path.join(dir, 'unreadable.jsonl')
    const l = commandLog(file)
    await l.append(entry('a'))
    await fs.chmod(file, 0)
    await assert.rejects(l.append(entry('b')))
    await fs.chmod(file, 0o644)
    assert.deepEqual((await l.read()).map((e) => e.id), ['a'])
  })
})
