import { expect, open, openPrefilledForm, record, test } from './fixtures'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const keysOf = (requests: { headers(): Record<string, string> }[]) => requests.map((request) => request.headers()['idempotency-key'])
const correlationsOf = (requests: { headers(): Record<string, string> }[]) => requests.map((request) => request.headers()['x-correlation-id'])

test.describe('payout form: submit', () => {
  test('happy path: accepted, shown at once as awaiting confirmation, settled by polling, kept after reload', { tag: '@smoke' }, async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page)
    const key = await page.getByTestId('idempotency-key').textContent()
    expect(key).toMatch(UUID)

    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Payout accepted')
    await expect(status).toContainText('2,450,000.00 NGN')
    // Once accepted, the countdown gives way to the rate the payout was accepted at.
    await expect(page.getByTestId('rate-countdown')).toHaveCount(0)
    await expect(page.getByTestId('rate-used')).toHaveText('Accepted at this rate')
    await expect(page.getByTestId('quote')).toContainText('1 USDC = 1,582.45 NGN')
    expect(posts).toHaveLength(1)
    expect(posts[0]?.headers()['idempotency-key']).toBe(key)
    expect(posts[0]?.headers()['x-correlation-id']).toMatch(/^cor_[0-9a-f]{20}$/)
    expect(posts[0]?.headers()['x-attempt']).toBe('1')
    expect(posts[0]?.postDataJSON().targetAmountMinor).toBe('245000000')

    await status.getByRole('link', { name: 'View in the instruction table' }).click()
    const row = page.locator('tr[data-row]').first()
    await expect(row).toContainText('PO-48261')
    await expect(row.locator('.ds-badge')).toHaveText('Awaiting confirmation')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 61 of 61 instructions')
    await expect(page.getByTestId('payout-detail')).toContainText('Accepted, not yet in the list')

    await expect(row.locator('.ds-badge')).toHaveText('Processing', { timeout: 15_000 })
    await expect(row.locator('.ds-badge')).toHaveText('Sent', { timeout: 20_000 })

    await page.reload()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 61 of 61 instructions')
    await expect(page.locator('tr[data-row]').first()).toContainText('PO-48261')
  })

  test('double clicks and repeated Enter send one request', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'slow')
    const submit = page.getByTestId('submit-payout')
    await submit.dblclick()
    await submit.click({ force: true })
    await submit.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('submission-status')).toContainText('Payout accepted')
    expect(posts).toHaveLength(1)
    await expect(page.getByTestId('attempts')).toHaveText('1')
  })

  test('Enter in a field submits once as well', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'slow')
    await page.getByLabel('Beneficiary name').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('submission-status')).toContainText('Payout accepted')
    expect(posts).toHaveLength(1)
  })

  test('duplicate submit: the second request is a replay and one payout exists', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'duplicate')
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Already received, not sent twice')
    await expect(status).toContainText('PO-48261')
    expect(posts).toHaveLength(2)
    await expect(page.getByTestId('attempts')).toHaveText('2')
    expect(new Set(keysOf(posts)).size).toBe(1)
    expect((await posts[1]?.response())?.headers()['idempotent-replayed']).toBe('true')
    expect((await posts[0]?.response())?.headers()['idempotent-replayed']).toBeUndefined()

    await page.getByRole('button', { name: 'Request log' }).first().click()
    const log = page.getByTestId('request-log')
    await expect(log.locator('tbody tr').filter({ hasText: '/api/payouts' })).toHaveCount(2)
    await expect(log.locator('tbody tr').filter({ hasText: 'Replay' })).toHaveCount(1)
    await page.keyboard.press('Escape')

    await status.getByRole('link', { name: 'View in the instruction table' }).click()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 61 of 61 instructions')
    await expect(page.locator('tr[data-row]').filter({ hasText: 'PO-48262' })).toHaveCount(0)
  })

  test('503: three counted attempts with backoff, then a manual retry with the same key goes through', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'fail-503')
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Not sent: the service answered 503')
    await expect(status).toContainText('3 attempts failed')
    await expect(status).toContainText('Correlation ID cor_')
    await expect(page.getByTestId('attempts')).toHaveText('3')
    expect(posts).toHaveLength(3)
    await expect(page.getByTestId('submit-payout')).toBeDisabled()
    await expect(page.getByTestId('simulate-toggle')).toContainText('Simulate: Normal')

    await page.getByTestId('retry-same-key').click()
    await expect(status).toContainText('Payout accepted')
    await expect(status).toContainText('on attempt 4')
    expect(posts).toHaveLength(4)
    expect(new Set(keysOf(posts)).size).toBe(1)
    const correlations = correlationsOf(posts)
    expect(new Set(correlations.slice(0, 3)).size).toBe(1)
    expect(correlations[3]).not.toBe(correlations[0])
    expect(posts.map((request) => request.headers()['x-attempt'])).toEqual(['1', '2', '3', '4'])

    await page.getByRole('button', { name: 'Request log' }).first().click()
    const rows = page.getByTestId('request-log').locator('tbody tr').filter({ hasText: '/api/payouts' })
    await expect(rows).toHaveCount(4)
    await expect(rows.filter({ hasText: 'Retryable' })).toHaveCount(3)
    await expect(rows.filter({ hasText: 'OK' })).toHaveCount(1)
    await expect(rows.first()).toContainText(correlations[3] ?? 'missing')
  })

  test('timeout: outcome unknown, no blind resend, status check finds the payout', { tag: '@smoke' }, async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    const checks = record(page, 'GET', /^\/api\/idempotency-keys\//)
    await openPrefilledForm(page, 'timeout-received')
    const key = await page.getByTestId('idempotency-key').textContent()
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('We could not confirm this payout')
    await expect(status).toContainText('Do not resend. Check status.')
    await expect(status).toContainText('Correlation ID cor_')
    await expect(page.getByRole('main').getByRole('button', { name: /try again|resend|retry/i })).toHaveCount(0)
    await expect(page.getByTestId('submit-payout')).toBeDisabled()
    await expect(page.getByLabel('Beneficiary name')).toBeDisabled()

    await page.getByTestId('check-status').click()
    await expect(status).toContainText('Received')
    await expect(status).toContainText('PO-48261')
    await expect(status).toContainText('Nothing needs resending')
    expect(posts).toHaveLength(1)
    expect(checks).toHaveLength(1)
    expect(new URL(checks[0]?.url() ?? 'http://x').pathname).toBe(`/api/idempotency-keys/${key}`)

    await page.getByRole('button', { name: 'Request log' }).first().click()
    await expect(page.getByTestId('request-log').locator('tbody tr').filter({ hasText: 'No answer' })).toHaveCount(1)
  })

  test('timeout: when the status check finds nothing, a resend with the same key is offered', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'timeout-lost')
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('We could not confirm this payout')
    await expect(page.getByTestId('resend')).toHaveCount(0)

    await page.getByTestId('check-status').click()
    await expect(status).toContainText('Not received, safe to resend')
    await page.getByTestId('resend').click()
    await expect(status).toContainText('Payout accepted')
    expect(posts).toHaveLength(2)
    expect(new Set(keysOf(posts)).size).toBe(1)
    expect(new Set(correlationsOf(posts)).size).toBe(2)
  })

  test('an unresolved submit survives a reload as outcome unknown, with the same key', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'timeout-received')
    const key = await page.getByTestId('idempotency-key').textContent()
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this payout')

    await page.reload()
    await expect(page.getByTestId('submission-status')).toContainText('This form was left while a submit was unresolved')
    await expect(page.getByTestId('idempotency-key')).toHaveText(key ?? '')
    // The attempt already sent is still counted after the reload.
    await expect(page.getByTestId('attempts')).toHaveText('1')
    await expect(page.getByLabel('Your reference')).toHaveValue(/^INV-\d{5}$/)
    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('submission-status')).toContainText('Received')
    expect(posts).toHaveLength(1)
  })

  test('an unresolved submit is kept when a new prefilled form is asked for, and a resend continues the attempt count', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'timeout-lost')
    const key = await page.getByTestId('idempotency-key').textContent()
    const reference = await page.getByLabel('Your reference').inputValue()
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('We could not confirm this payout')
    await expect(page.getByText('Locked until this submit is resolved.')).toBeVisible()

    // The links on the home page and in the Simulate panel all ask for a new prefilled form.
    await page.goto('/payouts/new?prefill=1')
    await expect(page.getByTestId('unresolved-notice')).toContainText('One submit is still unresolved. Check its status first.')
    await expect(status).toContainText('We could not confirm this payout')
    await expect(page.getByTestId('idempotency-key')).toHaveText(key ?? '')
    await expect(page.getByLabel('Your reference')).toHaveValue(reference)
    await expect(page.getByTestId('attempts')).toHaveText('1')
    await expect(page.getByTestId('submit-payout')).toBeDisabled()
    await expect(page).toHaveURL(/\/payouts\/new$/)

    await page.getByTestId('check-status').click()
    await expect(status).toContainText('Not received, safe to resend')
    await expect(page.getByTestId('unresolved-notice')).toHaveCount(0)
    await page.getByTestId('resend').click()
    await expect(status).toContainText('Payout accepted')
    await expect(page.getByTestId('attempts')).toHaveText('2')
    expect(new Set(keysOf(posts)).size).toBe(1)
    expect(posts[posts.length - 1]?.headers()['x-attempt']).toBe('2')
  })

  test('an expired rate locks Submit until the rate is refreshed', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page, 'short-quote')
    await expect(page.getByTestId('rate-countdown')).toContainText('Held for 0:0')
    await expect(page.getByTestId('submit-payout')).toBeEnabled()

    await expect(page.getByTestId('rate-expired')).toBeVisible({ timeout: 12_000 })
    await expect(page.getByTestId('rate-countdown')).toHaveText('Rate expired')
    await expect(page.getByTestId('submit-payout')).toBeDisabled()
    await expect(page.getByText('Locked: the rate expired.')).toBeVisible()
    await page.getByLabel('Beneficiary name').focus()
    await page.keyboard.press('Enter')
    expect(posts).toHaveLength(0)

    await page.getByTestId('get-rate').click()
    await expect(page.getByTestId('quote')).toBeVisible()
    await expect(page.getByTestId('rate-countdown')).toContainText('Held for 0:')
    await expect(page.getByTestId('submit-payout')).toBeEnabled()
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('Payout accepted')
    expect(posts).toHaveLength(1)
  })

  test('changing the amount drops the rate, and Submit asks for a new one', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page)
    await page.getByLabel('Amount the beneficiary receives').fill('2,450,001.00')
    await expect(page.getByTestId('quote')).toHaveCount(0)
    await page.getByTestId('submit-payout').click()
    const summary = page.getByTestId('error-summary')
    await expect(summary).toContainText('There is 1 problem')
    await expect(summary.getByRole('link', { name: 'Get a rate before you submit.' })).toBeVisible()
    await summary.getByRole('link', { name: 'Get a rate before you submit.' }).click()
    await expect(page.getByTestId('get-rate')).toBeFocused()
    expect(posts).toHaveLength(0)
  })
})

test.describe('payout form: hard validation', () => {
  test('an empty submit lists every problem, moves focus to the summary, and links to the fields', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await open(page, '/payouts/new')
    await page.getByTestId('submit-payout').click()
    const summary = page.getByTestId('error-summary')
    await expect(summary).toBeFocused()
    await expect(summary).toHaveAttribute('role', 'alert')
    await expect(summary).toContainText('There are 5 problems')
    await summary.getByRole('link', { name: 'Enter the beneficiary name.' }).click()
    await expect(page.getByLabel('Beneficiary name')).toBeFocused()
    await expect(page.getByLabel('Beneficiary name')).toHaveAttribute('aria-invalid', 'true')
    const describedBy = await page.getByLabel('Beneficiary name').getAttribute('aria-describedby')
    await expect(page.locator(`#${describedBy?.split(' ').pop()}`)).toHaveText('Enter the beneficiary name.')
    expect(posts).toHaveLength(0)
  })

  test('decimal places follow the currency: 2 for NGN, 0 for UGX, 6 for USDC', async ({ page }) => {
    await open(page, '/payouts/new')
    const amount = page.getByLabel('Amount the beneficiary receives')
    const error = page.locator('#payout-amount-error')
    await expect(amount).toBeDisabled()

    await page.getByLabel('Route').selectOption('USDC-NGN')
    await amount.fill('2450000.001')
    await amount.blur()
    await expect(error).toHaveText('NGN takes at most 2 decimal places.')
    await amount.fill('2450000.5')
    await amount.blur()
    await expect(error).toHaveCount(0)
    await expect(amount).toHaveValue('2,450,000.50')

    await page.getByLabel('Route').selectOption('USDC-UGX')
    await expect(error).toHaveText('UGX has no minor unit. Enter a whole number.')
    await amount.fill('7450000')
    await amount.blur()
    await expect(error).toHaveCount(0)
    await expect(amount).toHaveValue('7,450,000')

    await page.getByLabel('Route').selectOption('USD-USDC')
    await amount.fill('1000.1234567')
    await amount.blur()
    await expect(error).toHaveText('USDC takes at most 6 decimal places.')
    await amount.fill('1000.123456')
    await amount.blur()
    await expect(amount).toHaveValue('1,000.123456')
    await expect(page.getByLabel('Wallet address')).toBeVisible()
  })

  test('a comma is a thousands separator in a valid position and never a decimal point', async ({ page }) => {
    const quotes = record(page, 'POST', '/api/quotes')
    await open(page, '/payouts/new')
    await page.getByLabel('Route').selectOption('USDC-NGN')
    const amount = page.getByLabel('Amount the beneficiary receives')
    const error = page.locator('#payout-amount-error')

    // 1000,50 used to become 100,050.00, a hundred times what was typed.
    await amount.fill('1000,50')
    await amount.blur()
    await expect(error).toHaveText('Use a point for decimals, for example 1,000.50.')
    await expect(amount).toHaveValue('1000,50')
    await page.getByTestId('get-rate').click()
    await expect(page.getByTestId('quote')).toHaveCount(0)
    expect(quotes).toHaveLength(0)

    await amount.fill('1,000.50')
    await amount.blur()
    await expect(error).toHaveCount(0)
    await expect(amount).toHaveValue('1,000.50')
    await page.getByTestId('get-rate').click()
    await expect(page.getByTestId('quote')).toContainText('1,000.50')
    expect(quotes[0]?.postDataJSON().targetAmountMinor).toBe('100050')

    await amount.fill('.50')
    await amount.blur()
    await expect(error).toHaveText('The minimum on this route is 1,000.00 NGN.')
    await amount.fill('abc')
    await amount.blur()
    await expect(error).toHaveText('Enter the amount as digits, for example 1250.50.')

    await page.getByLabel('Route').selectOption('USDC-XOF')
    await expect(error).toHaveText('Enter the amount as digits, for example 1250.')
    await amount.fill('1650000,50')
    await amount.blur()
    await expect(error).toHaveText('Use commas only between groups of three digits, for example 1,000,000. XOF has no decimals.')
    await amount.fill('1,650,000')
    await amount.blur()
    await expect(error).toHaveCount(0)
  })

  test('limits, account format and the purpose code threshold are enforced', async ({ page }) => {
    await open(page, '/payouts/new')
    await page.getByLabel('Route').selectOption('USDC-NGN')
    const amount = page.getByLabel('Amount the beneficiary receives')

    await amount.fill('999.99')
    await amount.blur()
    await expect(page.locator('#payout-amount-error')).toHaveText('The minimum on this route is 1,000.00 NGN.')
    await amount.fill('50000000.01')
    await amount.blur()
    await expect(page.locator('#payout-amount-error')).toHaveText('The maximum on this route is 50,000,000.00 NGN.')

    const account = page.getByLabel('Account number')
    await account.fill('12345')
    await account.blur()
    await expect(page.locator('#payout-account-error')).toContainText('This is not a valid account number for NGN. 10 digits.')

    await expect(page.locator('label[for="payout-purpose"]')).toContainText('optional')
    await amount.fill('5000000')
    await amount.blur()
    await expect(page.locator('label[for="payout-purpose"]')).not.toContainText('optional')
    await page.getByLabel('Purpose code').focus()
    await page.getByLabel('Purpose code').blur()
    await expect(page.locator('#payout-purpose-error')).toHaveText('A purpose code is required at 5,000,000.00 NGN or more.')
    await page.getByLabel('Purpose code').selectOption('SUP')
    await expect(page.locator('#payout-purpose-error')).toHaveCount(0)
  })

  test('a final 422 from the API is tied to its field, with the correlation ID and no retry', async ({ page }) => {
    const posts = record(page, 'POST', '/api/payouts')
    await openPrefilledForm(page)
    await page.getByLabel('Account number').fill('0123450000')
    await page.getByTestId('submit-payout').click()
    const status = page.getByTestId('submission-status')
    await expect(status).toContainText('Not accepted (422)')
    await expect(status).toContainText('Sending the same request again will not help')
    await expect(status).toContainText('Correlation ID cor_')
    await expect(status.getByRole('button', { name: /retry|resend/i })).toHaveCount(0)
    await expect(page.locator('#payout-account-error')).toHaveText('The beneficiary bank does not recognise this account.')
    await expect(page.getByLabel('Account number')).toHaveAttribute('aria-invalid', 'true')
    expect(posts).toHaveLength(1)

    await page.getByLabel('Account number').fill('0123456781')
    await expect(page.locator('#payout-account-error')).toHaveCount(0)
    await page.getByTestId('submit-payout').click()
    await expect(status).toContainText('Payout accepted')
    expect(new Set(keysOf(posts)).size).toBe(1)
  })
})

test.describe('mock API contract', () => {
  test('requires a key, replays a repeated key, and rejects a reused key or reference', async ({ page }) => {
    await open(page, '/how-it-works')
    const result = await page.evaluate(async () => {
      const call = async (path: string, body: unknown, key?: string) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': 'cor_contract', ...(key ? { 'Idempotency-Key': key } : {}) },
          body: JSON.stringify(body),
        })
        return { status: response.status, replayed: response.headers.get('Idempotent-Replayed'), echo: response.headers.get('X-Correlation-Id'), body: await response.json() }
      }
      const quote = await call('/api/quotes', { routeId: 'USDC-KES', targetAmountMinor: '18650000' })
      const payout = {
        reference: 'CONTRACT-1',
        beneficiary: { name: 'Lakeview Freight Ltd', bank: 'Savanna Union Bank', account: '20045678901' },
        routeId: 'USDC-KES',
        targetAmountMinor: '18650000',
        quoteId: quote.body.id,
        purposeCode: null,
      }
      const noKey = await call('/api/payouts', payout)
      const first = await call('/api/payouts', payout, 'key-a')
      const again = await call('/api/payouts', payout, 'key-a')
      const changed = await call('/api/payouts', { ...payout, targetAmountMinor: '18650001' }, 'key-a')
      const sameReference = await call('/api/payouts', payout, 'key-b')
      const floatAmount = await call('/api/payouts', { ...payout, reference: 'CONTRACT-2', targetAmountMinor: '186500.00' }, 'key-c')
      const item = { line: 2, itemKey: 'item-1', reference: 'CONTRACT-1', beneficiary: payout.beneficiary, routeId: 'USDC-KES', targetAmountMinor: '18650000', purposeCode: null }
      const batch = await call('/api/batches', { items: [item, { ...item, line: 7, itemKey: 'item-2', reference: 'CONTRACT-3' }] }, 'key-d')
      const one = await fetch(`/api/payouts/${first.body.id}`).then(async (response) => ({ status: response.status, body: await response.json() }))
      const none = await fetch('/api/payouts/PO-1').then((response) => response.status)
      return { quote, noKey, first, again, changed, sameReference, floatAmount, batch, one, none }
    })
    expect(result.quote.status).toBe(201)
    expect(result.quote.body.source.amountMinor).toMatch(/^\d+$/)
    expect(result.noKey).toMatchObject({ status: 400, body: { code: 'idempotency_key_required' } })
    expect(result.first).toMatchObject({ status: 201, replayed: null, echo: 'cor_contract' })
    expect(result.again).toMatchObject({ status: 201, replayed: 'true' })
    expect(result.again.body.id).toBe(result.first.body.id)
    expect(result.changed).toMatchObject({ status: 409, body: { code: 'idempotency_key_reused' } })
    expect(result.sameReference).toMatchObject({ status: 409, body: { code: 'duplicate_reference', correlationId: 'cor_contract' } })
    expect(result.floatAmount).toMatchObject({ status: 422, body: { code: 'validation_failed' } })
    // A batch item with a reference that exists is rejected for good. The other item is booked and keeps its line number.
    expect(result.batch.status).toBe(201)
    expect(result.batch.body.items[0]).toMatchObject({ line: 2, status: 'rejected', payoutId: null, failure: { code: 'duplicate_reference', message: 'Reference already used.', retryable: false } })
    expect(result.batch.body.items[1]).toMatchObject({ line: 7, status: 'booked' })
    // One payout can be read by ID without the list's lag.
    expect(result.one).toMatchObject({ status: 200, body: { reference: 'CONTRACT-1' } })
    expect(result.none).toBe(404)
  })
})
