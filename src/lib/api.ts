import type { AppConfig, FileContent, ScanResult, UpdateStatus } from '@shared/types'

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
}
