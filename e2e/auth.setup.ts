import { expect, test as setup } from '@playwright/test'
import { stack, testEmail, waitForMagicLink } from './helpers'

const STATE_PATH = 'e2e/.auth/user.json'

/**
 * Critical flow 1: getting in.
 *
 * This drives the real magic link path: submit an address, receive an email, follow the
 * link, land inside the product. It is a setup project as well as a test, so the session
 * it produces is reused by the other flows instead of every test re-authenticating.
 */
setup('a new person can sign in with a magic link and reach the product', async ({ page }) => {
  const email = testEmail()
  stack() // fail fast with a clear message if the local stack is not running

  await page.goto('/')

  // Not signed in, so the app should send us to sign-in rather than showing anything.
  await expect(page).toHaveURL(/\/sign-in/)
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Send sign-in link' }).click()

  // The confirmation names the address, so a typo is visible before the user waits.
  await expect(page.getByText('Check your email')).toBeVisible()
  await expect(page.getByText(email)).toBeVisible()

  const link = await waitForMagicLink(email)
  await page.goto(link)

  // A brand new account has no project, so onboarding is the correct destination.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Set up your workspace' })).toBeVisible()

  await page.getByLabel('Organization name').fill('E2E Corp')
  await page.getByLabel('Project name').fill('Web app')
  await page.getByRole('button', { name: 'Create project' }).click()

  // Onboarding hands straight to the install screen, which is the one thing a new user
  // needs next.
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\/settings/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Install' })).toBeVisible()

  await page.context().storageState({ path: STATE_PATH })
})
