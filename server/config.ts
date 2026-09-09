import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppConfig } from '../shared/types.ts'
import { readJson } from './util.ts'

const CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'skills-manager')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export async function loadConfig(): Promise<AppConfig> {
  const cfg = (await readJson<Partial<AppConfig>>(CONFIG_FILE)) ?? {}
  const roots = Array.isArray(cfg.projectRoots) ? cfg.projectRoots.filter((r) => typeof r === 'string') : []
  return { projectRoots: roots }
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
}

export function configPath(): string {
  return CONFIG_FILE
}
