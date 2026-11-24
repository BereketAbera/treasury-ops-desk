import { chooseScenario, expect, FOOTER, openDesk, test } from './fixtures'

test.describe('instruction table', () => {
  test('a first visit in a fresh browser shows the seeded table without a reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions')
    await expect(page.locator('tr[data-row]')).toHaveCount(60)
    await expect(page.locator('tr[data-row]').first()).toContainText('PO-48260')
    await expect(page.getByTestId('sync-state')).toContainText('Last synced')
    await expect(page.locator('footer')).toHaveText(FOOTER)
  })

  test('the home page says what it is and links to each behaviour', async ({ page }) => {
    await openDesk(page)
    const note = page.getByTestId('what-this-is')
    await expect(note).toContainText('Sample by Bereket A.')
    await expect(note).toContainText('Vue 3')
    await expect(note.getByRole('link', { name: 'Idempotent submit' })).toHaveAttribute('href', /simulate=duplicate/)
    await expect(note.getByRole('link', { name: 'Outcome unknown' })).toHaveAttribute('href', /simulate=timeout-received/)
    await expect(note.getByRole('link', { name: 'Retries with backoff' })).toHaveAttribute('href', /simulate=fail-503/)
    await expect(note.getByRole('link', { name: 'Partial batch failure' })).toHaveAttribute('href', /simulate=partial-batch/)
    await expect(note.getByRole('link', { name: 'Design system' })).toHaveAttribute('href', '/storybook/')

    await note.getByRole('link', { name: 'Outcome unknown' }).click()
    await expect(page).toHaveURL(/\/payouts\/new$/)
    await expect(page.getByTestId('simulate-banner')).toContainText('Next submit times out, payout received')
    await expect(page.getByTestId('quote')).toBeVisible()

    await page.goBack()
    await openDesk(page)
    await page.getByTestId('what-this-is').getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByTestId('what-this-is')).toHaveCount(0)
  })

  test('filters and sort are kept in the URL and survive a reload', async ({ page }) => {
    await openDesk(page)
    await page.getByLabel('Status').selectOption('completed')
    await page.getByLabel('Route').selectOption('USDC-XOF')
    await page.getByLabel('Search').fill('gulu')
    await expect(page).toHaveURL(/status=completed/)
    await expect(page).toHaveURL(/route=USDC-XOF/)
    await expect(page).toHaveURL(/q=gulu/)
    const count = await page.getByTestId('row-count').textContent()
    expect(count).toMatch(/^Showing \d+ of 60 instructions$/)
    expect(count).not.toBe('Showing 60 of 60 instructions')

    await page.getByRole('button', { name: 'Target amount' }).click()
    await expect(page).toHaveURL(/sort=target%3Aasc|sort=target:asc/)
    await expect(page.getByRole('columnheader', { name: 'Target amount' })).toHaveAttribute('aria-sort', 'ascending')

    await page.reload()
    await expect(page.getByTestId('row-count')).toHaveText(count ?? '')
    await expect(page.getByLabel('Status')).toHaveValue('completed')
    await expect(page.getByLabel('Route')).toHaveValue('USDC-XOF')
    await expect(page.getByLabel('Search')).toHaveValue('gulu')
    await expect(page.getByRole('columnheader', { name: 'Target amount' })).toHaveAttribute('aria-sort', 'ascending')
    for (const row of await page.locator('tr[data-row]').all()) {
      await expect(row).toContainText('Gulu')
      await expect(row).toContainText('Completed')
      await expect(row).toContainText('XOF')
    }
  })

  test('sorting by target amount orders amounts inside each currency', async ({ page }) => {
    await openDesk(page, '/?currency=NGN&sort=target:desc')
    const amounts = await page.locator('tr[data-row] td[data-label="Target amount"] .ds-amount__number').allTextContents()
    const values = amounts.map((text) => Number(text.replace(/,/g, '')))
    expect(values.length).toBeGreaterThan(1)
    expect(values).toEqual([...values].sort((a, b) => b - a))
  })

  test('shows an empty state with a way back', async ({ page }) => {
    await openDesk(page, '/?q=zzzz-no-such-payout')
    await expect(page.getByText('No instructions match these filters.')).toBeVisible()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 0 of 60 instructions')
    await page.locator('.desk__empty').getByRole('button', { name: 'Clear filters' }).click()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions')
    await expect(page).toHaveURL(/\/$/)
  })

  test('rows are usable by keyboard and the detail panel returns focus', async ({ page }) => {
    await openDesk(page)
    const rows = page.locator('tr[data-row]')
    await rows.first().focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(rows.nth(2)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press('Enter')

    const panel = page.getByRole('complementary', { name: 'Payout PO-48259' })
    await expect(panel).toBeVisible()
    await expect(page).toHaveURL(/selected=PO-48259/)
    await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true')
    await expect(panel).toContainText('Idempotency key')
    await expect(panel).toContainText('Correlation ID')
    await expect(panel).toContainText('Status history')

    await panel.getByRole('button', { name: 'Close detail panel' }).click()
    await expect(panel).toHaveCount(0)
    await expect(rows.nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(rows.last()).toBeFocused()
  })

  test('an outcome unknown payout offers a status check and no retry', async ({ page }) => {
    await openDesk(page, '/?status=outcome_unknown')
    await expect(page.locator('tr[data-row]')).toHaveCount(2)
    await page.locator('tr[data-row]').first().click()
    const detail = page.getByTestId('payout-detail')
    await expect(detail).toContainText('We could not confirm this payout')
    await expect(detail).toContainText('Do not resend')
    await expect(detail.getByRole('button', { name: /retry|resend/i })).toHaveCount(0)
    await detail.getByRole('button', { name: 'Check status' }).click()
    await expect(detail).toContainText('Status confirmed: sent. The payment was made once.')
    await expect(detail.getByRole('button', { name: 'Check status' })).toHaveCount(0)
  })

  test('a retryable failure can be retried and a final one cannot', async ({ page }) => {
    await openDesk(page, '/?status=rejected')
    await page.locator('tr[data-row]').first().click()
    const detail = page.getByTestId('payout-detail')
    await expect(detail).toContainText('Retrying the same instruction will not help.')
    await expect(detail.getByRole('button', { name: 'Retry payout' })).toHaveCount(0)

    await page.goto('/?status=failed&q=')
    await expect(page.getByTestId('row-count')).toContainText('Showing 5 of')
    let retried = false
    for (const row of await page.locator('tr[data-row]').all()) {
      await row.click()
      const retry = detail.getByRole('button', { name: 'Retry payout' })
      if ((await retry.count()) === 0) continue
      await retry.click()
      await expect(detail).toContainText('Retry accepted. The payout is processing again.')
      retried = true
      break
    }
    expect(retried).toBe(true)
    await expect(page.getByTestId('row-count')).toContainText('Showing 4 of')
  })

  test('the row height toggle changes the density', async ({ page }) => {
    await openDesk(page)
    const firstCell = page.locator('tr[data-row] td').first()
    const height = async () => Math.round((await firstCell.boundingBox())?.height ?? 0)
    expect(await height()).toBe(32)
    const heights = page.getByRole('group', { name: 'Row height' })
    await heights.getByRole('radio', { name: '24' }).check({ force: true })
    await expect(page.locator('.ds-table')).toHaveClass(/ds-table--compact/)
    expect(await height()).toBe(24)
    await heights.getByRole('radio', { name: '40' }).check({ force: true })
    expect(await height()).toBe(40)
    await page.reload()
    await expect(page.locator('.ds-table').first()).toHaveClass(/ds-table--relaxed/)
  })

  test('a polling outage marks the table as out of date and recovers', async ({ page }) => {
    await openDesk(page)
    await chooseScenario(page, 'Polling outage')
    const banner = page.getByTestId('stale-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('This table may be out of date')
    await expect(banner).toContainText('with status 503')
    await expect(banner).toContainText('Correlation ID cor_')
    await expect(page.getByTestId('sync-state')).toContainText('out of date')
    await expect(page.locator('tr[data-row]')).toHaveCount(60)

    await chooseScenario(page, 'Normal')
    await expect(banner).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByTestId('sync-state')).not.toContainText('out of date')
  })

  test('the Simulate control offers every scenario with what to watch', async ({ page }) => {
    await openDesk(page)
    const toggle = page.getByTestId('simulate-toggle')
    await expect(toggle).toContainText('Simulate: Normal')
    await toggle.click()
    const labels = [
      'Normal',
      'Slow network',
      'Next submit times out, payout received',
      'Next submit times out, payout not received',
      'Next submit fails with 503',
      'Duplicate submit',
      'Next rate expires in 6 seconds',
      'Partial batch failure',
      'Polling outage',
    ]
    const panel = page.locator('#simulate-panel')
    await expect(panel.getByRole('radio')).toHaveCount(labels.length)
    for (const label of labels) {
      const radio = panel.getByRole('radio', { name: label, exact: true })
      await radio.check()
      await expect(toggle).toContainText(`Simulate: ${label}`)
      const describedBy = await radio.getAttribute('aria-describedby')
      expect((await page.locator(`#${describedBy}`).textContent())?.length).toBeGreaterThan(30)
      await expect(page.locator('#simulate-panel .simulate__try')).toHaveCount(1)
    }
    await page.getByRole('radio', { name: 'Normal', exact: true }).check()
    await page.keyboard.press('Escape')
    await expect(page.locator('#simulate-panel')).toBeHidden()
    await expect(toggle).toBeFocused()
  })

  test('reset demo data asks first, traps focus, and restores the seed', async ({ page }) => {
    await openDesk(page, '/?status=failed')
    const opener = page.getByRole('button', { name: 'Reset demo data' })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Reset demo data?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Keep my changes' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Reset demo data' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Keep my changes' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()

    await opener.click()
    await dialog.getByRole('button', { name: 'Reset demo data' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions')
  })

  test('an unknown address shows the not found page', async ({ page }) => {
    await page.goto('/no/such/page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.locator('footer')).toHaveText(FOOTER)
    await page.getByRole('main').getByRole('link', { name: 'Instructions' }).click()
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
  })
})
