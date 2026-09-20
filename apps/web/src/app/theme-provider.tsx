import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { THEME_STORAGE_KEY, ThemeContext, type Theme } from './theme-context'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private browsing or blocked storage. The system preference is a fine default.
  }
  return 'system'
}

const systemQuery = '(prefers-color-scheme: dark)'

function subscribeToSystem(onChange: () => void): () => void {
  const media = window.matchMedia(systemQuery)
  media.addEventListener('change', onChange)
  return () => {
    media.removeEventListener('change', onChange)
  }
}

function readSystem(): 'light' | 'dark' {
  return window.matchMedia(systemQuery).matches ? 'dark' : 'light'
}

// useSyncExternalStore requires a server snapshot. This app never renders on a server,
// but the callback has to be typed narrowly or the hook widens the result to string.
function readServerSystem(): 'light' | 'dark' {
  return 'light'
}

/**
 * Light and dark are equally first class here, so this keeps three states rather than a
 * boolean: the user can pick a side or defer to the operating system, and deferring stays
 * live rather than resolving once at load.
 *
 * The system preference is read through useSyncExternalStore rather than held in state and
 * updated from an effect. The media query is external state that React does not own, and
 * subscribing to it properly means the resolved theme is computed during render instead of
 * one render behind.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  const systemPreference = useSyncExternalStore(subscribeToSystem, readSystem, readServerSystem)
  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? systemPreference : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
