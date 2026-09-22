import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { adminClient, testEmail } from './helpers'

/**
 * Signing in with a password, and creating an account with one.
 *
 * These start signed out, unlike the rest of the suite, which reuses the session the magic
 * link setup produces. The magic link path itself is covered by auth.setup.ts, so what
 * matters here is that adding passwords did not replace it: the option to have a link
 * emailed is still on the screen.
 */
test.use({ storageState: { cookies: [], origins: [] } })

const PASSWORD = 'correct-horse-battery'

test('a new person can create an account with a password', async ({ page }) => {
  const email = testEmail()

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByRole('button', { name: 'Create account' }).click()

  // A brand new account has no project, so onboarding is the right destination.
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
})

test('an existing person can sign in with their password', async ({ page }) => {
  const email = testEmail()
  const admin = adminClient()
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  expect(created.error).toBeNull()

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 })
})

test('a wrong password is refused, with a message that says what to do', async ({ page }) => {
  const email = testEmail()
  const admin = adminClient()
  await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(`wrong-${randomUUID()}`)
  await page.getByRole('button', { name: 'Sign in' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('do not match an account')
  // Still on the sign-in screen, not half way into the app.
  await expect(page).toHaveURL(/\/sign-in/)
})

test('a password shorter than the limit is refused before it is sent', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Create an account' }).click()
  await page.getByLabel('Email').fill(testEmail())
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page.getByText('Use at least 8 characters')).toBeVisible()
  await expect(page).toHaveURL(/\/sign-in/)
})

test('the magic link option is still there', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click()

  // The password field goes away, because a link does not need one.
  await expect(page.getByLabel('Password', { exact: true })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Send sign-in link' })).toBeVisible()
})
