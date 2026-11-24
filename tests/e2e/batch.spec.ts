import { expect, open, record, test } from './fixtures'

test.describe('batches', () => {
  test('partial failure: 9 booked, 2 rejected, 1 unknown, and the retry sends only the 2 rejected', async ({ page }) => {
    const submits = record(page, 'POST', '/api/batches')
    const retries = record(page, 'POST', /^\/api\/batches\/BT-\d+\/retry$/)
    await open(page, '/batches/new?sample=1&simulate=partial-batch')
    await expect(page.getByTestId('simulate-banner')).toContainText('Partial batch failure')
    await expect(page.getByTestId('batch-check-summary')).toContainText('12 instructions, 12 valid, 0 with problems')

    await page.getByTestId('submit-batch').click()
    await expect(page).toHaveURL(/\/batches\/BT-\d+$/)
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 9 booked, 2 rejected, 1 outcome unknown.')
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
    expect(retries).toHaveLength(1)
    const sent = retries[0]?.postDataJSON().items as { line: number; itemKey: string }[]
    expect(sent.map((item) => item.line)).toEqual([4, 9])
    const originalKeys = (submits[0]?.postDataJSON().items as { itemKey: string }[]).map((item) => item.itemKey)
    for (const item of sent) expect(originalKeys).not.toContain(item.itemKey)
    await expect(page.getByTestId('batch-summary')).toHaveText('12 instructions: 11 booked, 0 rejected, 1 outcome unknown.')
    await expect(page.getByTestId('group-rejected')).toHaveCount(0)

    await page.getByTestId('check-item').click()
    await expect(page.getByTestId('batch-notice')).toHaveText('Line 7 was received and is booked. It was not sent again.')
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

  test('an uploaded file is checked line by line before it can be sent', async ({ page }) => {
    await open(page, '/batches/new')
    const csv = [
      'reference,beneficiary,bank,account,route,amount,purpose',
      'UP-1001,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,',
      'UP-1002,Kivu Agro Exports,Thousand Hills Bank,4002115678,USDC-RWF,2380000.50,',
      'UP-1003,Protea Packaging,Cape Meridian Bank,62,USDC-ZAR,48250.75,',
      'UP-1004,Volta Cold Chain,Gold Coast Mutual,1400023450000,USDC-GHS,31200.00,',
    ].join('\n')
    await page.getByLabel('Batch file (CSV)').setInputFiles({ name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.getByTestId('batch-check-summary')).toContainText('upload.csv: 4 instructions, 2 valid, 2 with problems')
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
    await expect(rejected).toContainText('account_not_found')
    await expect(rejected).toContainText('Rejected, final')
    await expect(page.getByTestId('retry-rejected')).toHaveCount(0)
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
