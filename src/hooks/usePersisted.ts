import { useState } from 'react'

/** Boolean kept in localStorage; `fallback` applies when nothing is stored yet. */
export function usePersistedBool(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key)
    return stored === null ? fallback : stored === '1'
  })
  const set = (v: boolean) => {
    setValue(v)
    localStorage.setItem(key, v ? '1' : '0')
  }
  return [value, set]
}
