import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LogEntry } from '../shared/types.ts'
import { configPath } from './config.ts'

const KEEP = 200
const MAX_OUTPUT = 32 * 1024

/** Runs the app started, one JSON object per line, oldest first. Only the newest 200 are kept. */
export function commandLog(file: string) {
  const read = async (): Promise<LogEntry[]> => {
    // Any other read error must surface: treating it as empty would let the next append wipe the history.
    const text = await fs.readFile(file, 'utf8').catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return ''
      throw e
    })
    const entries: LogEntry[] = []
    for (const line of text.split('\n')) {
      if (!line) continue
      try {
        entries.push(JSON.parse(line) as LogEntry)
      } catch {
        // Skip a line damaged by hand-editing.
      }
    }
    return entries
  }

  const append = async (entry: LogEntry) => {
    const output = entry.output.length > MAX_OUTPUT ? `[earlier output omitted]\n${entry.output.slice(-MAX_OUTPUT)}` : entry.output
    const entries = [...(await read()), { ...entry, output }].slice(-KEEP)
    // Rewritten whole and renamed into place, so a crash leaves the old file rather than half a line.
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, entries.map((e) => JSON.stringify(e) + '\n').join(''), 'utf8')
    await fs.rename(tmp, file)
  }

  return { file, read, append }
}

export const log = commandLog(path.join(path.dirname(configPath()), 'command-log.jsonl'))
