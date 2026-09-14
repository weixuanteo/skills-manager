import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
const KEY = 'sm-theme'

function resolve(t: Theme): 'light' | 'dark' {
  if (t === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return t
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => (localStorage.getItem(KEY) as Theme) || 'system')

  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle('dark', resolve(theme) === 'dark')
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    if (t === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  }, [])

  return { theme, setTheme }
}
