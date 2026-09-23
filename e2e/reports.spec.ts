import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { accessTokenFromPage, adminClient, stack, userClient } from './helpers'

/**
 * A property breakdown export, requested through the Reports form, finishes with a file.
 *
 * Until the redesign this could not work twice over: the form had nowhere to choose a
 * property, and the export worker had no access to the function that builds the file.
 */
test('a property breakdown export asks for a property, then finishes', async ({ page }) => {
  const { functionsUrl } = stack()

  await page.goto('/')
  await expect(page).toHaveURL(/\/p\/[0-9a-f-]+\//, { timeout: 30_000 })
  const projectId = /\/p\/([0-9a-f-]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? ''

  // Some events with a property, aggregated, so the property exists to break down by.
  const key = await userClient(await accessTokenFromPage(page))
    .schema('api')
    .rpc('create_api_key', {
      p_project_id: projectId,
      p_name: `e2e reports ${randomUUID().slice(0, 6)}`,
      p_key_type: 'secret',
    })
  const apiKey = (key.data as { api_key: string }[] | null)?.[0]?.api_key ?? ''
  const sent = await fetch(`${functionsUrl}/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      batch: ['pro', 'free', 'pro'].map((plan, i) => ({
        event: 'e2e_checkout',
        distinct_id: `e2e_${String(i)}`,
        ingest_id: randomUUID(),
        properties: { plan },
      })),
    }),
  })
  expect(sent.status).toBe(202)
  const rolled = await adminClient()
    .schema('jobs')
    .rpc('run_project_rollup', { p_project_id: projectId, p_lag: '0 seconds' })
  expect(rolled.error).toBeNull()

  await page.goto(`/p/${projectId}/reports`)
  await page.getByLabel('What to export').click()
  await page.getByRole('option', { name: 'Property breakdown' }).click()

  // Refused without a property, with a message saying what to do.
  await page.getByRole('button', { name: 'Create export' }).click()
  await expect(page.getByText('Choose a property to break down by')).toBeVisible()

  await page.getByLabel('Property').click()
  await page.getByRole('option', { name: 'plan' }).click()
  await page.getByRole('button', { name: 'Create export' }).click()

  const row = page.getByRole('row').filter({ hasText: 'Property breakdown' }).first()
  await expect(row.getByText('Ready')).toBeVisible({ timeout: 20_000 })
  await expect(row.getByRole('button', { name: 'Download' })).toBeVisible()
})
