import type { SearchHit } from '../shared/types.ts'

// Undocumented but unauthenticated endpoints used by skills.sh itself and the `skills` CLI. The
// per-IP limit is roughly 30 searches a minute, so results are cached.
const BASE = 'https://skills.sh/api'
const TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; hits: SearchHit[] }>()

interface RawHit {
  id?: string
  source?: string
  skillId?: string
  name?: string
  installs?: number
}

function toHit(r: RawHit): SearchHit | undefined {
  if (!r.source || !r.name || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.source)) return undefined
  return { id: r.id ?? `${r.source}/${r.skillId ?? r.name}`, name: r.name, source: r.source, installs: r.installs ?? 0 }
}

async function cached(key: string, url: string): Promise<SearchHit[]> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.hits
  const res = await fetch(url, { headers: { 'User-Agent': 'skills-manager' }, signal: AbortSignal.timeout(15000) })
  if (res.status === 429) throw new Error('skills.sh is rate limiting searches; wait a minute and try again.')
  if (!res.ok) throw new Error(`skills.sh responded ${res.status}.`)
  const body = (await res.json()) as { skills?: RawHit[] }
  const hits = (body.skills ?? []).map(toHit).filter((h): h is SearchHit => !!h)
  if (cache.size > 200) cache.delete(cache.keys().next().value!)
  cache.set(key, { at: Date.now(), hits })
  return hits
}

export async function searchSkills(query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const hits = await cached(`q:${q}`, `${BASE}/search?q=${encodeURIComponent(q)}&limit=60`)
  return [...hits].sort((a, b) => b.installs - a.installs)
}

export function popularSkills(): Promise<SearchHit[]> {
  return cached('popular', `${BASE}/skills/all-time/0`)
}
