import type { Page } from '@playwright/test'
import { chooseScenario, expect, FOOTER, openDesk, openPrefilledForm, test } from './fixtures'

// The WCAG 1.4.12 text-spacing overrides. Added through the CSS object model, because the page's
// Content-Security-Policy rightly refuses an injected style element.
const TEXT_SPACING = [
  '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }',
  'p { margin-bottom: 2em !important; }',
]

async function applyTextSpacing(page: Page) {
  await page.evaluate((rules) => {
    const sheet = Array.from(document.styleSheets).find((item) => item.ownerNode instanceof HTMLLinkElement)
    if (!sheet) throw new Error('no stylesheet to extend')
    for (const rule of rules) sheet.insertRule(rule, sheet.cssRules.length)
  }, TEXT_SPACING)
}

/** Rows that are fully inside the window and inside the table's own scroll area. */
async function visibleRows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const scroller = document.querySelector('.ds-table__scroll')!.getBoundingClientRect()
    const head = document.querySelector('.ds-table thead')!.getBoundingClientRect()
    const top = Math.max(scroller.top, head.bottom, 0)
    const bottom = Math.min(scroller.bottom, window.innerHeight)
    return Array.from(document.querySelectorAll('tr[data-row]')).filter((row) => {
      const box = row.getBoundingClientRect()
      return box.height > 0 && box.top >= top - 1 && box.bottom <= bottom + 1
    }).length
  })
}

test.describe('the table gets the screen', () => {
  for (const size of [
    { width: 1024, height: 768, atLeast: 8 },
    { width: 1440, height: 900, atLeast: 15 },
  ]) {
    test(`at ${size.width} by ${size.height}, with the note open, at least ${size.atLeast} rows are in view`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await openDesk(page)
      await expect(page.getByTestId('what-this-is')).toBeVisible()
      expect(await visibleRows(page)).toBeGreaterThanOrEqual(size.atLeast)
    })
  }

  test('at 1280 by 800 with the WCAG text-spacing overrides, rows are still in view', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openDesk(page)
    await applyTextSpacing(page)
    expect(await visibleRows(page)).toBeGreaterThanOrEqual(4)
    const tableHeight = await page.locator('.ds-table__scroll').evaluate((node) => node.getBoundingClientRect().height)
    expect(tableHeight).toBeGreaterThanOrEqual(300)
    // With the detail panel open as well.
    await page.locator('tr[data-row]').first().click()
    await expect(page.getByTestId('payout-detail')).toBeVisible()
    expect(await visibleRows(page)).toBeGreaterThanOrEqual(4)
  })
})

test.describe('Status is on screen at every width', () => {
  for (const width of [320, 390, 720, 768, 800, 900, 940, 1000, 1001, 1024, 1100, 1101, 1200, 1280, 1361, 1425, 1426, 1440, 1920]) {
    test(`at ${width} pixels, with no sideways scroll in the instruction table`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openDesk(page)
      const look = async () =>
        page.evaluate(() => {
          const region = document.querySelector('.ds-table__scroll')!
          const area = region.getBoundingClientRect()
          const badges = Array.from(document.querySelectorAll('tr[data-row] .ds-badge')).map((node) => node.getBoundingClientRect())
          return {
            sideways: region.scrollWidth - region.clientWidth,
            badges: badges.length,
            outside: badges.filter((box) => box.width === 0 || box.left < area.left - 1 || box.right > Math.min(area.right, window.innerWidth) + 1).length,
          }
        })
      const list = await look()
      expect(list.badges).toBeGreaterThan(0)
      expect(list).toMatchObject({ sideways: 0, outside: 0 })
      // The same with a payout open: beside the table, or over it in a drawer.
      await page.locator('tr[data-row]').first().click()
      await expect(page.getByTestId('payout-detail')).toBeVisible()
      expect(await look()).toMatchObject({ sideways: 0, outside: 0 })
    })
  }
})

test.describe('instruction table', () => {
  test('the summary strip accounts for every instruction in the table', async ({ page }) => {
    await openDesk(page)
    const counts = await page.locator('.summary__count dd').allTextContents()
    expect(counts.reduce((sum, text) => sum + Number(text), 0)).toBe(60)
    await expect(page.locator('.summary__count').filter({ hasText: 'Draft or cancelled' }).locator('dd')).toHaveText('4')
  })

  test('a first visit in a fresh browser shows the seeded table without a reload', { tag: '@smoke' }, async ({ page }) => {
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
    await expect(note).toContainText('for a fictional company')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payout instructions')
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
    await page.keyboard.press('Home')
    await expect(rows.first()).toBeFocused()
  })

  test('Escape closes the detail panel and returns focus to its row', async ({ page }) => {
    await openDesk(page)
    const rows = page.locator('tr[data-row]')
    await rows.nth(3).focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('complementary', { name: 'Payout PO-48257' })
    await expect(panel).toBeVisible()

    // From the row, and from a control inside the panel.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(page).not.toHaveURL(/selected=/)
    await expect(rows.nth(3)).toBeFocused()

    await page.keyboard.press('Enter')
    await panel.getByRole('button', { name: 'Copy idempotency key' }).focus()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(rows.nth(3)).toBeFocused()

    // An open drawer takes Escape for itself and leaves the panel alone.
    await page.keyboard.press('Enter')
    await expect(panel).toBeVisible()
    await page.getByRole('button', { name: 'Request log' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Request log' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Request log' })).toHaveCount(0)
    await expect(panel).toBeVisible()
  })

  test('a hostile sort or filter in the address falls back to the default view', async ({ page }) => {
    for (const query of ['sort=__proto__:asc', 'sort=hasOwnProperty', 'sort=constructor:desc&status=__proto__&route=toString&currency=valueOf']) {
      await openDesk(page, `/?${query}`)
      await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions')
      await expect(page.locator('tr[data-row]').first()).toContainText('PO-48260')
      await expect(page.getByRole('columnheader', { name: 'Created' })).toHaveAttribute('aria-sort', 'descending')
      await expect(page.getByLabel('Status')).toHaveValue('')
    }
  })

  test('a selected ID that does not exist gets a notice and is dropped from the address', async ({ page }) => {
    await openDesk(page, '/?selected=PO-99999&status=failed')
    const notice = page.getByTestId('selected-missing')
    await expect(notice).toContainText('No instruction with the ID PO-99999')
    await expect(page).not.toHaveURL(/selected=/)
    await expect(page).toHaveURL(/status=failed/)
    await notice.getByRole('button', { name: 'Dismiss' }).click()
    await expect(notice).toHaveCount(0)

    await page.goto('/?selected=not-an-id')
    await expect(page.getByTestId('selected-missing')).toContainText('not-an-id')
    await expect(page).not.toHaveURL(/selected=/)
  })

  test('rates are grouped, fixed to the places of their route, and lined up on the decimal point', async ({ page }) => {
    await openDesk(page)
    const cells = page.locator('tr[data-row] td[data-label="Rate"] .ds-rate')
    const texts = await cells.allTextContents()
    expect(texts.length).toBe(60)
    for (const text of texts) expect(text, text).toMatch(/^(\d{1,3}(,\d{3})*)\.(\d{2}|\d{4})$/)
    expect(texts.some((text) => /^\d,\d{3}\.\d{2}$/.test(text))).toBe(true)
    // Every decimal point sits at the same horizontal position.
    const points = await cells.evaluateAll((nodes) => nodes.map((node) => Math.round(node.querySelector('.ds-rate__fraction')!.getBoundingClientRect().left)))
    expect(new Set(points).size).toBe(1)
  })

  test('a filter change is announced once to screen readers, and polling is not', async ({ page }) => {
    await openDesk(page)
    const live = page.getByTestId('filter-announcement')
    await expect(live).toHaveAttribute('role', 'status')
    await expect(live).toHaveText('')
    await page.getByLabel('Status').selectOption('failed')
    await expect(live).toHaveText('Showing 5 of 60 instructions, sorted by created, descending.')
    await page.getByRole('button', { name: 'Target amount' }).click()
    await expect(live).toHaveText('Showing 5 of 60 instructions, sorted by target amount, ascending.')
    // Two more polls arrive and the text stays as it was.
    const polls = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/payouts')
    await polls
    await page.waitForResponse((response) => new URL(response.url()).pathname === '/api/payouts')
    await expect(live).toHaveText('Showing 5 of 60 instructions, sorted by target amount, ascending.')
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

  test('a reload during a polling outage says it could not load, never that the list is empty', async ({ page }) => {
    await openDesk(page)
    await chooseScenario(page, 'Polling outage')
    await expect(page.getByTestId('stale-banner')).toBeVisible()
    await page.reload()

    await expect(page.getByTestId('never-loaded-banner')).toContainText('Could not load instructions yet. Retrying.')
    await expect(page.getByTestId('never-loaded')).toContainText('This is not an empty list')
    await expect(page.getByTestId('row-count')).toHaveText('No instructions loaded yet')
    await expect(page.getByText('No instructions match these filters.')).toHaveCount(0)
    await expect(page.getByText('The rows below are the last ones received.')).toHaveCount(0)
    await expect(page.getByText(/see all 0 instructions/)).toHaveCount(0)
    await expect(page.locator('tr[data-row]')).toHaveCount(0)

    await chooseScenario(page, 'Normal')
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions', { timeout: 20_000 })
    await expect(page.getByTestId('never-loaded-banner')).toHaveCount(0)
  })

  test('the Simulate panel closes when focus leaves it', async ({ page }) => {
    await openDesk(page)
    const toggle = page.getByTestId('simulate-toggle')
    await toggle.click()
    const panel = page.locator('#simulate-panel')
    await expect(panel).toBeVisible()
    // Tab past the last control in the panel: the radio group, then the link under the chosen option.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(panel).toBeHidden()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
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
      'Next batch submit times out, batch received',
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

  test('reset is not available while a submit is on its way', async ({ page }) => {
    await openPrefilledForm(page, 'slow')
    await page.getByTestId('submit-payout').click()
    await page.getByRole('button', { name: 'Reset demo data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset demo data?' })
    await expect(dialog).toContainText('A submit is on its way. Wait for its result before a reset.')
    await expect(dialog.getByRole('button', { name: 'Reset demo data' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Reset demo data' })).toBeEnabled()
    await dialog.getByRole('button', { name: 'Reset demo data' }).click()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions', { timeout: 20_000 })
  })

  test('an unknown address shows the not found page', async ({ page }) => {
    await page.goto('/no/such/page')
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
    await expect(page.locator('footer')).toHaveText(FOOTER)
    await page.getByRole('main').getByRole('link', { name: 'Payout instructions' }).click()
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
  })
})
