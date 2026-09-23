import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { args } from './lib/env.ts'

/**
 * Captures every screen, in both themes, at both widths, in each of its states.
 *
 * These are the pictures the design review works from, and the before and after pairs in
 * the redesign report. They are taken against the real local stack and the real seeded
 * data, so a screen that is empty here is empty because the database is.
 *
 * Loading, empty and error are produced by `?state=`, which `apps/web/src/lib/dev-state.ts`
 * turns into a Supabase fetch that never settles, returns nothing, or fails. That parameter
 * is development only and CI proves it is absent from a production build.
 *
 * Usage:
 *   node scripts/screenshots.ts --out docs/screenshots/before
 *   node scripts/screenshots.ts --screen overview --state error --theme dark
 */

const flags = args(process.argv.slice(2))

const outDir = flags.get('out') ?? 'docs/screenshots/before'
const baseUrl = flags.get('base') ?? 'http://127.0.0.1:5173'
const email = flags.get('email') ?? 'demo@example.test'
const password = flags.get('password') ?? 'demo-password-change-me'
const keepExisting = flags.get('keep') === 'true'

type State = 'default' | 'loading' | 'empty' | 'error'
type Theme = 'light' | 'dark'

interface Viewport {
  name: string
  width: number
}

/** A desktop monitor and the narrowest phone we support. */
const VIEWPORTS: Viewport[] = [
  { name: '1440', width: 1440 },
  { name: '375', width: 375 },
]

const THEMES: Theme[] = ['light', 'dark']

interface Screen {
  name: string
  /** Path under the project, or an absolute path when it does not live under one. */
  path: string
  /** Absolute paths are visited as-is and do not get a project id. */
  absolute?: boolean
  /** Screens with no data surface are captured in their default state only. */
  states: State[]
  /** Captured signed out. */
  signedOut?: boolean
  /** Only captured at these viewports. Defaults to all of them. */
  viewports?: string[]
  /** Something to wait for before shooting, beyond the general settle. */
  ready?: (page: Page) => Promise<void>
}

const DATA_STATES: State[] = ['default', 'loading', 'empty', 'error']
const ONE_STATE: State[] = ['default']

const SCREENS: Screen[] = [
  { name: 'overview', path: 'overview', states: DATA_STATES },
  { name: 'events', path: 'events', states: DATA_STATES },
  { name: 'live', path: 'live', states: DATA_STATES },
  { name: 'funnels', path: 'funnels', states: DATA_STATES },
  { name: 'retention', path: 'retention', states: DATA_STATES },
  { name: 'reports', path: 'reports', states: DATA_STATES },
  { name: 'health', path: 'health', states: DATA_STATES },
  { name: 'settings', path: 'settings', states: DATA_STATES },

  // The other settings tabs carry most of the screen's interface, so they are captured too.
  // Keys and members have row actions, so they are checked at phone width as well.
  {
    name: 'settings-project',
    path: 'settings?tab=project',
    states: ONE_STATE,
    viewports: ['1440'],
  },
  { name: 'settings-keys', path: 'settings?tab=keys', states: ONE_STATE },
  { name: 'settings-members', path: 'settings?tab=members', states: ONE_STATE },
  { name: 'settings-audit', path: 'settings?tab=audit', states: ONE_STATE, viewports: ['1440'] },

  { name: 'onboarding', path: '/onboarding', absolute: true, states: ONE_STATE },
  { name: 'sign-in', path: '/sign-in', absolute: true, states: ONE_STATE, signedOut: true },
]

/**
 * The app shell is `h-svh` and scrolls inside its main area rather than scrolling the
 * page, so a full-page screenshot at a 900px viewport would stop at the fold and a review
 * would never see the lower half of a screen. The viewport is grown to the content height
 * instead, capped so that one runaway list cannot produce a 30,000px image.
 */
const MIN_HEIGHT = 900
const MAX_HEIGHT = 3200

async function fitViewportToContent(page: Page, width: number): Promise<void> {
  const contentHeight = await page.evaluate(() => {
    const candidates = [document.documentElement.scrollHeight, document.body.scrollHeight]
    for (const element of document.querySelectorAll('main, [data-scroll-region]')) {
      const box = element.getBoundingClientRect()
      candidates.push(Math.ceil(box.top + element.scrollHeight))
    }
    return Math.max(...candidates)
  })

  const height = Math.min(Math.max(contentHeight, MIN_HEIGHT), MAX_HEIGHT)
  await page.setViewportSize({ width, height })
}

function urlFor(screen: Screen, projectId: string, state: State): string {
  const path = screen.absolute ? screen.path : `/p/${projectId}/${screen.path}`
  const url = new URL(path, baseUrl)
  if (state !== 'default') url.searchParams.set('state', state)
  return url.href
}

/** Waits for web fonts, so a shot never catches a fallback face mid-swap. */
async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}

async function settle(page: Page, state: State): Promise<void> {
  if (state === 'loading') {
    // Nothing will ever resolve, so there is no network event to wait for. This is long
    // enough for the skeletons to mount and for fonts to land.
    await page.waitForTimeout(1200)
    await waitForFonts(page)
    return
  }

  try {
    await page.waitForLoadState('networkidle', { timeout: 15_000 })
  } catch {
    // The live screen holds a websocket open, so it is never network idle. Its content is
    // already rendered by the time this times out.
  }

  // A failed read is retried twice with backoff before the screen gives up and shows its
  // error, about three seconds in. Shooting earlier would capture skeletons, not the error.
  if (state === 'error') await page.waitForTimeout(4500)

  // Skeletons mark themselves aria-busy. Wait for the last one to go, where the screen has any.
  await page
    .waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, {
      timeout: 15_000,
    })
    .catch(() => undefined)

  await waitForFonts(page)
  await page.waitForTimeout(400)
}

async function signIn(page: Page): Promise<string> {
  await page.goto(new URL('/sign-in', baseUrl).href)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.waitForURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })

  const projectId = /\/p\/([0-9a-f-]+)\//.exec(page.url())?.[1]
  if (!projectId) throw new Error(`Signed in but landed on ${page.url()}, with no project id`)
  return projectId
}

async function capture(
  context: BrowserContext,
  screen: Screen,
  projectId: string,
  state: State,
  theme: Theme,
  viewport: Viewport,
): Promise<string> {
  const page = await context.newPage()
  await page.setViewportSize({ width: viewport.width, height: MIN_HEIGHT })

  try {
    await page.goto(urlFor(screen, projectId, state), { waitUntil: 'domcontentloaded' })
    await settle(page, state)
    if (screen.ready) await screen.ready(page)
    await fitViewportToContent(page, viewport.width)
    await page.waitForTimeout(150)

    const file = join(outDir, `${screen.name}-${state}-${theme}-${viewport.name}.png`)
    await page.screenshot({ path: file, animations: 'disabled', scale: 'css' })
    return file
  } finally {
    await page.close()
  }
}

async function serverIsUp(): Promise<boolean> {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(2000) })
    return response.ok
  } catch {
    return false
  }
}

async function startDevServer(): Promise<ChildProcess> {
  const port = new URL(baseUrl).port || '5173'
  const child = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', port], {
    cwd: 'apps/web',
    stdio: 'ignore',
    detached: false,
  })

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (await serverIsUp()) return child
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  child.kill()
  throw new Error(`The dev server did not come up on ${baseUrl} within 60 seconds.`)
}

async function main(): Promise<void> {
  const wanted = flags.get('screen')
  const wantedState = flags.get('state')
  const wantedTheme = flags.get('theme')
  const wantedWidth = flags.get('width')

  const screens = wanted ? SCREENS.filter((s) => s.name === wanted) : SCREENS
  if (screens.length === 0) {
    throw new Error(
      `No screen called "${wanted ?? ''}". Known screens: ${SCREENS.map((s) => s.name).join(', ')}`,
    )
  }

  let devServer: ChildProcess | null = null
  if (!(await serverIsUp())) {
    console.log(`Starting the dev server on ${baseUrl}`)
    devServer = await startDevServer()
  }

  if (!keepExisting && !wanted) await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  let browser: Browser | null = null
  let written = 0

  try {
    browser = await chromium.launch()

    // One signed-in context per theme. Playwright's colorScheme drives the media query,
    // and the app's default theme is "system", so this needs no localStorage poking.
    const signedIn = new Map<Theme, BrowserContext>()
    const signedOut = new Map<Theme, BrowserContext>()
    let projectId = ''

    for (const theme of THEMES) {
      const context = await browser.newContext({ colorScheme: theme, deviceScaleFactor: 1 })
      const page = await context.newPage()
      projectId = await signIn(page)
      await page.close()
      signedIn.set(theme, context)
      signedOut.set(theme, await browser.newContext({ colorScheme: theme, deviceScaleFactor: 1 }))
    }

    console.log(`Signed in, project ${projectId}\n`)

    for (const screen of screens) {
      const states = wantedState ? screen.states.filter((s) => s === wantedState) : screen.states
      const viewports = VIEWPORTS.filter(
        (v) =>
          (!screen.viewports || screen.viewports.includes(v.name)) &&
          (!wantedWidth || v.name === wantedWidth),
      )
      const themes = wantedTheme ? THEMES.filter((t) => t === wantedTheme) : THEMES

      for (const state of states) {
        for (const theme of themes) {
          for (const viewport of viewports) {
            const pool = screen.signedOut ? signedOut : signedIn
            const context = pool.get(theme)
            if (!context) continue

            const file = await capture(context, screen, projectId, state, theme, viewport)
            written += 1
            console.log(`  ${file}`)
          }
        }
      }
    }
  } finally {
    await browser?.close()
    devServer?.kill()
  }

  console.log(`\n${String(written)} screenshots in ${outDir}`)
}

main().catch((error: unknown) => {
  console.error('Screenshots failed:', error)
  process.exit(1)
})
