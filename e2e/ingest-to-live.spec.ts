import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { accessTokenFromPage, stack, userClient } from './helpers'

/**
 * Critical flow 3: an event arrives and a human sees it.
 *
 * This is the one flow that crosses every part of the system in a single assertion: the
 * ingestion function, the database, row level security on a Realtime subscription, and the
 * dashboard. If this passes, the product fundamentally works.
 */
test('an event sent to the API appears on the live screen', async ({ page }) => {
  const { functionsUrl } = stack()

  await page.goto('/')
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? ''
  expect(projectId).toBeTruthy()

  // A secret key, created directly, because minting one through the interface is flow 2's
  // job and this test should fail for ingestion reasons only. Created as the signed-in
  // user rather than the service role, so it goes through the same permission check a real
  // request would.
  const key = await userClient(await accessTokenFromPage(page))
    .schema('api')
    .rpc('create_api_key', {
      p_project_id: projectId,
      p_name: `e2e ingest ${randomUUID().slice(0, 6)}`,
      p_key_type: 'secret',
    })
  expect(key.error).toBeNull()
  const apiKey = (key.data as { api_key: string }[] | null)?.[0]?.api_key ?? ''
  expect(apiKey.startsWith('sk_live_')).toBe(true)

  await page.goto(`/p/${projectId}/live`)
  await expect(page.getByRole('heading', { name: 'Listening' })).toBeVisible()

  const marker = `e2e_user_${randomUUID().slice(0, 8)}`
  const response = await fetch(`${functionsUrl}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch: [
        {
          event: 'e2e_signal',
          distinct_id: marker,
          ingest_id: randomUUID(),
          properties: { source: 'playwright' },
        },
      ],
    }),
  })
  expect(response.status).toBe(202)

  // Realtime, so this should be well under two seconds.
  await expect(page.getByText(marker)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('e2e_signal').first()).toBeVisible()

  // The inspector shows exactly what was stored, including the context we derived.
  await page.getByText(marker).click()
  await expect(page.getByText('"source": "playwright"')).toBeVisible()
  await expect(page.getByText('"ua_family"')).toBeVisible()
})

test('pausing stops the feed moving', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? ''

  await page.goto(`/p/${projectId}/live`)
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByRole('heading', { name: 'Listening' })).toBeVisible()
})
