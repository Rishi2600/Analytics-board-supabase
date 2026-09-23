import { randomUUID } from 'node:crypto'
import { devices, expect, test, type Page } from '@playwright/test'
import { accessTokenFromPage, userClient } from './helpers'

/**
 * Guarantees from the redesign that a screenshot cannot show: a destructive action asks
 * first, row actions exist on a device that cannot hover, and the keyboard can skip the
 * navigation.
 */

async function projectWithKey(page: Page): Promise<{ projectId: string; keyName: string }> {
  await page.goto('/')
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? ''
  const keyName = `a11y key ${randomUUID().slice(0, 6)}`
  const created = await userClient(await accessTokenFromPage(page))
    .schema('api')
    .rpc('create_api_key', { p_project_id: projectId, p_name: keyName, p_key_type: 'public' })
  expect(created.error).toBeNull()
  return { projectId, keyName }
}

test('revoking a key asks first, and Escape leaves it working', async ({ page }) => {
  const { projectId, keyName } = await projectWithKey(page)
  await page.goto(`/p/${projectId}/settings?tab=keys`)

  const row = page.getByRole('row').filter({ hasText: keyName })
  await row.getByRole('button', { name: `Revoke ${keyName}` }).focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(`Revoke ${keyName}?`)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(row.getByText('Revoked')).toBeHidden()

  await row.getByRole('button', { name: `Revoke ${keyName}` }).click()
  await dialog.getByRole('button', { name: 'Revoke key' }).click()
  await expect(row.getByText('Revoked')).toBeVisible()
})

test('the first Tab reaches a skip link that moves focus to the content', async ({ page }) => {
  await page.goto('/')
  // The URL changes before the shell renders, so wait for the page itself.
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible({
    timeout: 30_000,
  })

  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#content')).toBeFocused()
})

test.describe('on a phone', () => {
  // Chromium with touch emulation reports (hover: none), which is what reveals row actions.
  const { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor } = devices['Pixel 7']
  test.use({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor })

  test('row actions are visible without hovering', async ({ page }) => {
    const { projectId, keyName } = await projectWithKey(page)
    await page.goto(`/p/${projectId}/settings?tab=keys`)

    const revoke = page.getByRole('button', { name: `Revoke ${keyName}` })
    await expect(revoke).toBeVisible()
    await expect(revoke).toHaveCSS('opacity', '1')
  })

  test('the navigation opens as a sheet and takes you to a screen', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })

    await page.getByRole('button', { name: 'Show or hide navigation' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Retention' }).click()
    await expect(page.getByRole('heading', { name: 'Retention', level: 1 })).toBeVisible()
    await expect(page.getByRole('dialog')).toBeHidden()
  })
})
