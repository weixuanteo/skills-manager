import { useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'sm-theme'
const systemDark = window.matchMedia('(prefers-color-scheme: dark)')

const stored = (): Theme => (localStorage.getItem(KEY) as Theme) || 'system'

function apply(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && systemDark.matches))
}

// index.html applies the stored theme before first paint; this keeps "system" in step afterwards.
systemDark.addEventListener('change', () => apply(stored()))

export function useTheme() {
  const [theme, setThemeState] = useState(stored)
  const setTheme = (t: Theme) => {
    setThemeState(t)
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
    apply(t)
  }
  return { theme, setTheme }
}
