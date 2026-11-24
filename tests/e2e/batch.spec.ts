import type { Page } from '@playwright/test'
import { bookedPayouts, breakNext, chooseScenario, expect, expectInView, open, openDesk, record, test } from './fixtures'

const keysOf = (requests: { headers(): Record<string, string> }[]) => new Set(requests.map((request) => request.headers()['idempotency-key']))

test.describe('batches', () => {
  test('partial failure: 9 booked, 2 rejected, 1 unknown, and the retry sends only the 2 rejected', { tag: '@smoke' }, async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    const retries = record(page, 'POST', /^\/api\/batches\/BT-\d+\/retry$/)
    await open(page, '/batches/new?sample=1&simulate=partial-batch')
    await expect(page.getByTestId('simulate-banner')).toContainText('Partial batch failure')
    await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions, 12 valid, 0 with problems')

    await page.getByTestId('submit-batch').click()
    await expect(page).toHaveURL(/\/batches\/BT-\d+$/)
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 9 booked, 2 rejected, 1 outcome unknown.')
    // The route change puts focus on the result heading, and it stays there while the batch loads.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByTestId('batch-badge')).toHaveText('9 of 12 booked')
    expect(submits).toHaveLength(1)
    expect(submits[0]?.postDataJSON().items).toHaveLength(12)
    expect(submits[0]?.headers()['idempotency-key']).toBeTruthy()

    const rejected = page.getByTestId('group-rejected')
    await expect(rejected.getByRole('heading')).toHaveText('Rejected (2)')
    await expect(rejected).toContainText('rail_unavailable')
    await expect(rejected).toContainText('rate_expired')
    await expect(rejected).toContainText('The booked lines are not sent again.')
    await expect(page.getByTestId('group-unknown').getByRole('heading')).toHaveText('Outcome unknown (1)')
    await expect(page.getByTestId('group-unknown')).toContainText('Do not resend it: check status first')
    await expect(page.getByTestId('group-booked').getByRole('heading')).toHaveText('Booked (9)')

    await page.getByTestId('retry-rejected').click()
    await expect(page.getByTestId('batch-notice')).toHaveText('Retried 2 instructions: 2 booked. The 9 booked earlier were not sent again.')
    // The retry button is gone with its group. Focus goes to the heading, not to the top of the document.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    expect(retries).toHaveLength(1)
    const sent = retries[0]?.postDataJSON().items as { line: number; itemKey: string }[]
    // Line numbers are the file's own: the header is line 1, so the fourth and ninth instructions are lines 5 and 10.
    expect(sent.map((item) => item.line)).toEqual([5, 10])
    const originalKeys = (submits[0]?.postDataJSON().items as { itemKey: string }[]).map((item) => item.itemKey)
    for (const item of sent) expect(originalKeys).not.toContain(item.itemKey)
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 11 booked, 0 rejected, 1 outcome unknown.')
    await expect(page.getByTestId('group-rejected')).toHaveCount(0)

    await page.getByTestId('check-item').click()
    await expect(page.getByTestId('batch-notice')).toHaveText('Line 8 was received and is booked. It was not sent again.')
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    await expect(page.getByTestId('batch-badge')).toHaveText('12 of 12 booked')

    await page.reload()
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    await page.goto('/')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 72 of 72 instructions', { timeout: 15_000 })
  })

  test('a normal batch books every line and appears under recent batches', async ({ page }) => {
    await open(page, '/batches/new')
    await page.getByTestId('load-sample').click()
    await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions, 12 valid')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    await expect(page.getByTestId('group-booked').locator('tbody tr')).toHaveCount(12)

    await page.getByRole('link', { name: 'Upload another batch' }).click()
    await expect(page.getByRole('heading', { name: 'Recent batches' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Recent batches table' })).toContainText('12 of 12 booked')
  })

  test('running the sample batch twice books 24 payouts with 24 different references', async ({ page }) => {
    for (const run of [1, 2]) {
      await open(page, '/batches/new?sample=1')
      await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions, 12 valid')
      await page.getByTestId('submit-batch').click()
      await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
      await expect(page.getByTestId('group-booked').locator('tbody tr'), `run ${run}`).toHaveCount(12)
    }
    await openDesk(page, '/?q=BAT-')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 24 of 84 instructions', { timeout: 15_000 })
    const references = await page.evaluate(async () => {
      const response = await fetch('/api/payouts', { headers: { 'X-Correlation-Id': 'cor_check' } })
      const body = (await response.json()) as { items: { reference: string }[] }
      return body.items.map((item) => item.reference)
    })
    expect(references).toHaveLength(84)
    expect(new Set(references).size).toBe(84)
    expect(references.filter((reference) => reference.startsWith('BAT-'))).toHaveLength(24)
  })

  test('the same file uploaded twice is rejected line by line: the reference is already used', async ({ page }) => {
    const csv = [
      'reference,beneficiary,bank,account,route,amount,purpose',
      'DUP-2001,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,',
      'DUP-2002,Kivu Agro Exports,Thousand Hills Bank,4002115678,USDC-RWF,2380000,',
    ].join('\n')
    const upload = async () => {
      await open(page, '/batches/new')
      await page.getByLabel('Batch file (CSV)').setInputFiles({ name: 'twice.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
      await expect(page.getByTestId('file-name')).toHaveText('twice.csv')
      await page.getByTestId('submit-batch').click()
    }
    await upload()
    await expect(page.getByTestId('batch-summary')).toHaveText('2 instructions: 2 booked, 0 rejected, 0 outcome unknown.')

    await upload()
    await expect(page.getByTestId('batch-summary')).toHaveText('2 instructions: 0 booked, 2 rejected, 0 outcome unknown.')
    const rejected = page.getByTestId('group-rejected')
    await expect(rejected.locator('tbody tr')).toHaveCount(2)
    await expect(rejected).toContainText('Reference already used.')
    await expect(rejected).toContainText('duplicate_reference')
    await expect(rejected).toContainText('Rejected, final')
    await expect(page.getByTestId('retry-rejected')).toHaveCount(0)

    await openDesk(page, '/?q=DUP-')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 2 of 62 instructions', { timeout: 15_000 })
  })

  test('a 503 on a batch submit is retried with the same key, then offered again by hand', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    await open(page, '/batches/new?sample=1&simulate=fail-503')
    await page.getByTestId('submit-batch').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Temporary failure: the service answered 503', { timeout: 15_000 })
    await expect(status).toContainText('3 attempts failed')
    expect(submits).toHaveLength(3)
    expect(submits.map((request) => request.headers()['x-attempt'])).toEqual(['1', '2', '3'])

    // Like the payout form: locked, and the only way on is a retry with the same key.
    await expect(page.getByTestId('submit-batch')).toBeDisabled()
    await expect(page.getByTestId('load-sample')).toBeDisabled()
    await expect(page.getByTestId('choose-file')).toBeDisabled()
    await page.getByTestId('retry-same-key').click()
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    expect(keysOf(submits).size).toBe(1)
    expect(submits.map((request) => request.headers()['x-attempt'])).toEqual(['1', '2', '3', '4'])
  })

  test('the batches page lists every batch with its summary, and starts a new one', async ({ page }) => {
    await open(page, '/batches')
    await expect(page.getByRole('heading', { level: 1, name: 'Batches' })).toBeVisible()
    await expect(page.getByTestId('batches-empty')).toContainText('No batches yet')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page')

    await page.getByRole('main').getByRole('link', { name: 'New batch' }).click()
    await expect(page).toHaveURL(/\/batches\/new$/)
    await page.goto('/batches/new?sample=1&simulate=partial-batch')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toContainText('9 booked')

    await page.getByRole('link', { name: 'All batches' }).click()
    const row = page.getByTestId('batches-table').locator('tbody tr')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('9 of 12 booked')
    await expect(row).toContainText('12 instructions: 9 booked, 2 rejected, 1 outcome unknown.')
    await row.getByRole('link', { name: 'BT-301' }).click()
    await expect(page.getByTestId('batch-badge')).toHaveText('9 of 12 booked')
  })

  test('amounts in the file preview are grouped like every other amount', async ({ page }) => {
    await open(page, '/batches/new?sample=1')
    const amounts = page.getByRole('region', { name: 'Instructions in the file' }).locator('tbody td[data-label="Amount"]')
    await expect(amounts.first()).toHaveText(/^2,450,000\.00\s*NGN$/)
    await expect(amounts.nth(4)).toHaveText(/^7,450,000\s*UGX$/)
    await expect(amounts.nth(2)).toHaveText(/^48,250\.75\s*ZAR$/)
  })

  test('an uploaded file is checked line by line before it can be sent', async ({ page }) => {
    await open(page, '/batches/new')
    const csv = [
      'reference,beneficiary,bank,account,route,amount,purpose',
      'UP-1001,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,',
      'UP-1002,Kivu Agro Exports,Thousand Hills Bank,4002115678,USDC-RWF,2380000.50,',
      'UP-1003,Protea Packaging,Cape Meridian Bank,62,USDC-ZAR,48250.75,',
      'UP-1004,Volta Cold Chain,Densu Mutual,1400023450000,USDC-GHS,31200.00,',
    ].join('\n')
    await page.getByLabel('Batch file (CSV)').setInputFiles({ name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByTestId('batch-check-summary')).toContainText('upload.csv: 4 instructions, 2 valid, 2 with problems')
    await expect(page.getByTestId('file-name')).toHaveText('upload.csv')
    await expect(page.getByText('RWF has no minor unit. Enter a whole number.')).toBeVisible()
    await expect(page.getByText(/not a valid account number for ZAR/)).toBeVisible()
    await expect(page.getByTestId('submit-batch')).toBeDisabled()

    await page.getByRole('button', { name: 'Remove the 2 lines with problems' }).click()
    await expect(page.getByTestId('submit-batch')).toBeEnabled()
    await expect(page.getByTestId('submit-batch')).toHaveText('Submit batch of 2')
    await page.getByTestId('submit-batch').click()

    // The account ending 0000 passes the format check here and is refused by the API: a final rejection.
    await expect(page.getByTestId('batch-summary')).toHaveText('2 instructions: 1 booked, 1 rejected, 0 outcome unknown.')
    const rejected = page.getByTestId('group-rejected')
    // Lines 3 and 4 were removed. The two that were sent keep their numbers from the file: 2 and 5.
    await expect(page.getByTestId('group-booked').locator('tbody tr td').first()).toHaveText('2')
    await expect(rejected.locator('tbody tr td').first()).toHaveText('5')
    await expect(rejected).toContainText('account_not_found')
    await expect(rejected).toContainText('Rejected, final')
    await expect(page.getByTestId('retry-rejected')).toHaveCount(0)
  })

  test('the file control is a real button that the keyboard reaches, and a file can be dropped on it', async ({ page }) => {
    await open(page, '/batches/new')
    const choose = page.getByTestId('choose-file')
    await expect(choose).toHaveText('Choose a CSV file')
    await expect(page.getByTestId('file-name')).toHaveText('No file chosen')
    await choose.focus()
    await expect(choose).toBeFocused()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await (await chooser).setFiles({ name: 'picked.csv', mimeType: 'text/csv', buffer: Buffer.from('name,value\nA,1') })
    await expect(page.getByTestId('file-name')).toHaveText('picked.csv')
    await expect(page.getByText('This file cannot be used')).toBeVisible()

    const data = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      const csv = 'reference,beneficiary,bank,account,route,amount,purpose\nDROP-1,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,'
      transfer.items.add(new File([csv], 'dropped.csv', { type: 'text/csv' }))
      return transfer
    })
    await page.getByTestId('batch-drop').dispatchEvent('drop', { dataTransfer: data })
    await expect(page.getByTestId('file-name')).toHaveText('dropped.csv')
    await expect(page.getByTestId('batch-check-summary')).toContainText('1 instruction, 1 valid, 0 with problems')
  })

  test('a file without the right columns is refused with a reason', async ({ page }) => {
    await open(page, '/batches/new')
    await page.getByLabel('Batch file (CSV)').setInputFiles({ name: 'wrong.csv', mimeType: 'text/csv', buffer: Buffer.from('name,value\nA,1') })
    await expect(page.getByText('This file cannot be used')).toBeVisible()
    await expect(page.getByText(/Missing: reference, beneficiary/)).toBeVisible()
  })

  test('an unknown batch ID explains itself', async ({ page }) => {
    await open(page, '/batches/BT-999')
    await expect(page.getByRole('heading', { name: 'Batch not found' })).toBeVisible()
    await expect(page.getByText('There is no batch with this ID')).toBeVisible()
  })
})

/** Submits the sample batch and waits until its outcome is unknown. */
async function submitUnknownBatch(page: Page, scenario: 'batch-timeout' | 'timeout-lost') {
  await open(page, `/batches/new?sample=1&simulate=${scenario}`)
  await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions, 12 valid')
  await page.getByTestId('submit-batch').click()
  await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this batch', { timeout: 15_000 })
}

async function expectBatchLocked(page: Page) {
  await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this batch')
  await expect(page.getByTestId('check-status')).toBeEnabled()
  for (const control of ['submit-batch', 'choose-file', 'load-sample']) await expect(page.getByTestId(control), control).toBeDisabled()
  await expect(page.locator('#batch-file')).toBeDisabled()
}

test.describe('batch submit with an unknown outcome', () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`at ${viewport.width} by ${viewport.height} the notice is focused and in view, with the correlation ID and Check status`, { tag: viewport.width === 390 ? '@smoke' : [] }, async ({ page }) => {
      await page.setViewportSize(viewport)
      await submitUnknownBatch(page, 'batch-timeout')
      const status = page.getByTestId('submission-status')
      await expect(status).toBeFocused()
      await expectInView(page, status)
      await expect(status).toContainText('Do not resend. Check status.')
      await expect(status).toContainText('Correlation ID cor_')
      await expect(page.getByRole('main').getByRole('button', { name: /try again|resend|retry/i })).toHaveCount(0)
      await expectBatchLocked(page)
    })
  }

  test('received: the check finds the batch, opens its result, and nothing is sent or booked twice', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    const checks = record(page, 'GET', /^\/api\/idempotency-keys\//)
    await submitUnknownBatch(page, 'batch-timeout')
    await page.getByTestId('check-status').click()
    await expect(page).toHaveURL(/\/batches\/BT-301$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByTestId('batch-arrival')).toContainText('Received')
    await expect(page.getByTestId('batch-arrival')).toContainText('It was recorded before the answer was lost')
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    expect(submits).toHaveLength(1)
    expect(checks).toHaveLength(1)
    expect(new URL(checks[0]?.url() ?? 'http://x').pathname).toBe(`/api/idempotency-keys/${[...keysOf(submits)][0]}`)

    await open(page, '/batches')
    await expect(page.getByTestId('batches-table').locator('tbody tr')).toHaveCount(1)
    await openDesk(page)
    await expect(page.getByTestId('row-count')).toHaveText('Showing 72 of 72 instructions', { timeout: 15_000 })
  })

  test('not received: the check says so, and only then is a resend with the same key offered', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    await submitUnknownBatch(page, 'timeout-lost')
    await expect(page.getByTestId('resend')).toHaveCount(0)
    await page.getByTestId('check-status').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Not received, safe to resend')
    await expect(status).toBeFocused()
    expect(await bookedPayouts(page)).toHaveLength(60)

    await page.getByTestId('resend').click()
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    await expect(page.getByTestId('batch-arrival')).toHaveCount(0)
    expect(submits).toHaveLength(2)
    expect(keysOf(submits).size).toBe(1)
    expect(submits.map((request) => request.headers()['x-attempt'])).toEqual(['1', '2'])
    expect(submits[1]?.postDataJSON()).toEqual(submits[0]?.postDataJSON())
    expect(await bookedPayouts(page)).toHaveLength(72)
  })

  test('no path creates a second batch while one is unresolved', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    await submitUnknownBatch(page, 'batch-timeout')
    const key = await page.getByTestId('idempotency-key').textContent()
    const rail = page.getByRole('navigation', { name: 'Main' })

    // On the page itself: keys, forced clicks, a control re-enabled by hand, a dropped file.
    for (let press = 0; press < 5; press += 1) await page.keyboard.press('Enter')
    await page.getByTestId('submit-batch').click({ force: true, clickCount: 2 })
    await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('.batch button, .batch input').forEach((node) => (node.disabled = false)))
    await page.getByTestId('submit-batch').click()
    await page.getByTestId('load-sample').click()
    const file = { name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('reference,beneficiary,bank,account,route,amount,purpose\nOTHER-1,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,') }
    await page.getByLabel('Batch file (CSV)').setInputFiles(file)
    const data = await page.evaluateHandle(() => {
      const transfer = new DataTransfer()
      transfer.items.add(new File(['reference,beneficiary,bank,account,route,amount,purpose\nDROP-1,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,'], 'dropped.csv', { type: 'text/csv' }))
      return transfer
    })
    await page.getByTestId('batch-drop').dispatchEvent('drop', { dataTransfer: data })
    await page.getByTestId('submit-batch').click({ force: true })
    await expect(page.getByTestId('file-name')).toHaveText('sample-batch.csv')
    await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions')

    // Reload, Back and Forward, the rail, the batches page, Simulate, and a link that asks for a new sample.
    const sent = submits[0]?.headers()['x-correlation-id'] ?? 'missing'
    await page.reload()
    await expectBatchLocked(page)
    await expect(page.getByTestId('submission-status')).toContainText(sent)
    await expect(page.getByTestId('batch-check-summary')).toContainText('sample-batch.csv: 12 instructions')
    await rail.getByRole('link', { name: 'Payout instructions' }).click()
    await page.goBack()
    await expectBatchLocked(page)
    await page.goBack()
    await page.goForward()
    await expectBatchLocked(page)
    await rail.getByRole('link', { name: 'Batches' }).click()
    await page.getByRole('main').getByRole('link', { name: 'New batch' }).click()
    await expectBatchLocked(page)
    await rail.getByRole('link', { name: 'Payout instructions' }).click()
    await chooseScenario(page, 'Partial batch failure')
    await page.getByTestId('simulate-toggle').click()
    await page.locator('#simulate-panel').getByRole('link', { name: 'Open the sample batch' }).click()
    await expect(page.getByTestId('unresolved-notice')).toContainText('One submit is still unresolved. Check its status first.')
    await expectBatchLocked(page)
    await page.goto('/batches/new?sample=1')
    await expect(page.getByTestId('unresolved-notice')).toBeVisible()
    await expect(page).toHaveURL(/\/batches\/new$/)
    await expectBatchLocked(page)
    await expect(page.getByTestId('idempotency-key')).toHaveText(key ?? '')

    expect(submits).toHaveLength(1)
    const booked = await bookedPayouts(page)
    expect(booked).toHaveLength(72)
    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('batch-arrival')).toContainText('Received')
    expect(submits).toHaveLength(1)
    const references = (await bookedPayouts(page)).map((item) => item.reference)
    expect(new Set(references).size).toBe(72)

    // Resolved: the form starts a new batch again.
    await page.getByRole('link', { name: 'Upload another batch' }).click()
    await expect(page.getByTestId('load-sample')).toBeEnabled()
    await expect(page.getByTestId('file-name')).toHaveText('No file chosen')
  })

  test('while a batch is being sent, the form is locked and leaving the page does not lose it', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    await open(page, '/batches/new?sample=1&simulate=slow')
    await page.getByTestId('submit-batch').dblclick()
    await expect(page.getByTestId('load-sample')).toBeDisabled()
    await expect(page.getByTestId('choose-file')).toBeDisabled()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Payout instructions' }).click()
    await page.goBack()
    await expect(page.getByTestId('load-sample')).toBeDisabled()
    await expect(page).toHaveURL(/\/batches\/BT-301$/)
    expect(submits).toHaveLength(1)

    // Accepted while another page is open: it opens no page by itself, and the form says what happened.
    await open(page, '/batches/new?sample=1')
    await page.getByTestId('submit-batch').click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Payout instructions' }).click()
    await expect.poll(async () => (await bookedPayouts(page)).length).toBe(84)
    await expect(page.getByTestId('row-count')).toContainText('of 84', { timeout: 20_000 })
    await expect(page).toHaveURL(/\/$/)
    await page.goBack()
    await expect(page.getByTestId('batch-arrival')).toContainText('BT-302')
    await expect(page.getByTestId('load-sample')).toBeEnabled()
    expect(submits).toHaveLength(2)
  })

  test('a replayed result says "already received, not sent twice"', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    // The batch is booked, a gateway answers 504, and the automatic retry gets the first result back.
    await breakNext(page, /^\/api\/batches$/, 504)
    await open(page, '/batches/new?sample=1')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-arrival')).toContainText('Already received, not sent twice')
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 12 booked, 0 rejected, 0 outcome unknown.')
    expect(submits).toHaveLength(2)
    expect(keysOf(submits).size).toBe(1)
    expect((await submits[1]?.response())?.headers()['idempotent-replayed']).toBe('true')
    expect(await bookedPayouts(page)).toHaveLength(72)
  })
})

test.describe('batch retry with an unknown outcome', () => {
  async function partialBatch(page: Page, how: 'request' | 'answer') {
    await breakNext(page, /^\/api\/batches\/BT-\d+\/retry$/, how)
    await open(page, '/batches/new?sample=1&simulate=partial-batch')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toContainText('9 booked, 2 rejected')
    await page.getByTestId('retry-rejected').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this retry', { timeout: 15_000 })
  }

  test('received: no second retry and no new batch until the check finds it', async ({ page }) => {
    const retries = record(page, 'POST', /^\/api\/batches\/BT-\d+\/retry$/)
    const submits = record(page, 'POST', '/api/batches')
    await partialBatch(page, 'answer')
    const status = page.getByTestId('submission-status')
    await expect(status).toBeFocused()
    await expectInView(page, status)
    await expect(status).toContainText('Correlation ID cor_')
    await expect(page.getByTestId('retry-rejected')).toBeDisabled()
    for (const text of ['no money moved', 'nothing was booked', 'can retry']) await expect(page.getByTestId('group-rejected')).not.toContainText(text)
    expect(retries[0]?.headers()['idempotency-key']).toBeTruthy()

    await page.reload()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this retry')
    await page.getByRole('link', { name: 'Upload another batch' }).click()
    await expect(page.getByTestId('unresolved-retry')).toContainText('BT-301')
    for (const control of ['choose-file', 'load-sample']) await expect(page.getByTestId(control), control).toBeDisabled()
    await page.goto('/batches/new?sample=1')
    await expect(page.getByTestId('load-sample')).toBeDisabled()
    await expect(page.getByTestId('batch-check-summary')).toHaveCount(0)
    await page.getByTestId('unresolved-retry').getByRole('link', { name: 'BT-301' }).click()

    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('batch-notice')).toContainText('The status check found this retry')
    await expect(page.getByTestId('batch-notice')).toContainText('Retried 2 instructions: 2 booked. The 9 booked earlier were not sent again.')
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 11 booked, 0 rejected, 1 outcome unknown.')
    expect(retries).toHaveLength(1)
    expect(submits).toHaveLength(1)
    expect(await bookedPayouts(page)).toHaveLength(72)
    await page.getByRole('link', { name: 'Upload another batch' }).click()
    await expect(page.getByTestId('load-sample')).toBeEnabled()
  })

  test('not received: the resend carries the same key and the same two lines', async ({ page }) => {
    const retries = record(page, 'POST', /^\/api\/batches\/BT-\d+\/retry$/)
    await partialBatch(page, 'request')
    await page.reload()
    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('submission-status')).toContainText('Not received, safe to resend')
    await expect(page.getByTestId('retry-rejected')).toBeDisabled()
    await page.getByTestId('resend').click()
    await expect(page.getByTestId('batch-notice')).toContainText('Retried 2 instructions: 2 booked.')
    expect(retries).toHaveLength(1)
    expect((retries[0]?.postDataJSON().items as { line: number }[]).map((item) => item.line)).toEqual([5, 10])
    expect(await bookedPayouts(page)).toHaveLength(72)
  })
})
