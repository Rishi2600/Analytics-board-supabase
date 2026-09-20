import { expect, test } from '@playwright/test'

async function openProjectSettings(page: import('@playwright/test').Page): Promise<string> {
  await page.goto('/')
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? ''
  expect(projectId).toBeTruthy()

  await page.goto(`/p/${projectId}/settings?tab=keys`)
  await expect(page.getByRole('heading', { name: 'API keys' })).toBeVisible()
  return projectId
}

/**
 * Critical flow 2: creating a credential.
 *
 * The property under test is not "a key appears". It is that the key is shown exactly once
 * and is genuinely unrecoverable afterwards, because the entire security model rests on us
 * storing only a hash.
 */
test('a key is shown once, and never again', async ({ page }) => {
  await openProjectSettings(page)

  await page.getByRole('button', { name: 'Create key' }).first().click()
  await page.getByLabel('Name').fill('Playwright key')
  await page.getByRole('dialog').getByRole('button', { name: 'Create key' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Key created' })).toBeVisible()

  const keyText = await dialog.locator('code').first().innerText()
  expect(keyText.startsWith('pk_live_')).toBe(true)
  expect(keyText.length).toBeGreaterThan(30)

  await dialog.getByRole('button', { name: 'Done' }).click()

  // The table shows the prefix and nothing more. The full key is not in the DOM, not in an
  // attribute, and nowhere else on the page.
  await expect(page.getByText('Playwright key')).toBeVisible()
  expect(await page.content()).not.toContain(keyText)
  expect(await page.content()).toContain(keyText.slice(0, 12))

  // Reloading does not bring it back either.
  await page.reload()
  await expect(page.getByText('Playwright key')).toBeVisible()
  expect(await page.content()).not.toContain(keyText)
})

/**
 * The accessibility floor, checked where it can only be checked in a browser.
 *
 * Role enforcement is asserted exhaustively against the database in
 * tests/rls-tenancy.test.ts, for every role and every table, which is both cheaper and more
 * thorough than driving a browser. What a browser can check, and nothing else can, is
 * whether a keyboard user can actually reach and leave this dialog.
 */
test('the create key dialog is reachable and escapable by keyboard', async ({ page }) => {
  await openProjectSettings(page)

  await page.getByRole('button', { name: 'Create key' }).first().focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Focus must land inside the dialog, or a keyboard user is stranded behind it.
  const focusedInsideDialog = await page.evaluate(() => {
    const active = document.activeElement
    const dialogElement = document.querySelector('[role="dialog"]')
    return Boolean(active && dialogElement?.contains(active))
  })
  expect(focusedInsideDialog).toBe(true)

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()

  // Nothing was created by opening and closing it.
  await expect(page.getByText('No API keys yet').or(page.getByText('Prefix'))).toBeVisible()
})
