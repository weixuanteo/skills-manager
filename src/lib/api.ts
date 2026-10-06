import type { ActionResult, AppConfig, FileContent, InstallRequest, RemoteRepo, ScanResult, SearchHit, UpdateStatus } from '@shared/types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) msg = body.error
    } catch {
      // Keep the HTTP status if the response isn't JSON.
    }
    throw new Error(msg)
  }
  return (await res.json()) as T
}

export const api = {
  scan: (refresh = false) => req<ScanResult>(`/api/skills${refresh ? '?refresh=1' : ''}`),
  file: (id: string, path: string) => req<FileContent>(`/api/skills/${id}/file?path=${encodeURIComponent(path)}`),
  updates: () => req<Record<string, UpdateStatus>>('/api/updates'),
  update: (id: string) => req<UpdateStatus>(`/api/updates/${id}`),
  config: () => req<AppConfig & { envRoots: string[]; configFile: string }>('/api/config'),
  saveConfig: (projectRoots: string[]) =>
    req<{ projectRoots: string[]; invalid: string[] }>('/api/config', { method: 'PUT', body: JSON.stringify({ projectRoots }) }),
  run: (id: string, command: string) => req<ActionResult>(`/api/skills/${id}/run`, { method: 'POST', body: JSON.stringify({ command }) }),
  search: (q: string) => req<SearchHit[]>(`/api/discover/search?q=${encodeURIComponent(q)}`),
  repo: (input: string, refresh = false) => req<RemoteRepo>(`/api/discover/repo?input=${encodeURIComponent(input)}${refresh ? '&refresh=1' : ''}`),
  remoteFile: (r: { owner: string; repo: string; sha: string }, path: string) =>
    req<FileContent>(`/api/discover/file?${new URLSearchParams({ owner: r.owner, repo: r.repo, sha: r.sha, path })}`),
  install: (body: InstallRequest, dryRun = false) => req<ActionResult>('/api/discover/install', { method: 'POST', body: JSON.stringify({ ...body, dryRun }) }),
}

export type FileResult = { file: FileContent; error?: undefined } | { file?: undefined; error: string }

/** Never rejects, so it can be read with `use()` without an error boundary. */
export const loadFile = (id: string, path: string): Promise<FileResult> => settle(api.file(id, path))

export const settle = (p: Promise<FileContent>): Promise<FileResult> =>
  p.then(
    (file) => ({ file }),
    (e: Error) => ({ error: e.message }),
  )
