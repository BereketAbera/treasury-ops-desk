import { chooseScenario, expect, expectNoAxeViolations, expectNoSidewaysScroll, FOOTER, open, openDesk, openPrefilledForm, test } from './fixtures'

test.describe('accessibility: axe on every page and state', () => {
  test('instruction table', async ({ page }) => {
    await openDesk(page)
    await expectNoAxeViolations(page)
  })

  test('instruction table with the detail panel open', async ({ page }) => {
    await openDesk(page, '/?status=failed')
    await page.locator('tr[data-row]').first().click()
    await expect(page.getByTestId('payout-detail')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('instruction table, empty and stale states', async ({ page }) => {
    await openDesk(page, '/?q=zzzz')
    await chooseScenario(page, 'Polling outage')
    await expect(page.getByTestId('stale-banner')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('Simulate panel open', async ({ page }) => {
    await openDesk(page)
    await page.getByTestId('simulate-toggle').click()
    await expect(page.locator('#simulate-panel')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('request log drawer: focus is trapped and restored', async ({ page }) => {
    await openPrefilledForm(page)
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('Payout accepted')
    const opener = page.getByRole('button', { name: 'Request log' }).first()
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Request log' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toBeFocused()
    await expect(page.getByTestId('request-log')).toContainText('/api/payouts')
    await expect(page.getByTestId('request-log')).toContainText('cor_')
    await expectNoAxeViolations(page)

    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
    await drawer.getByLabel('Show table sync requests').check()
    await expect(drawer.getByLabel('Show table sync requests')).toBeChecked()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(opener).toBeFocused()
  })

  test('reset dialog', async ({ page }) => {
    await openDesk(page)
    await page.getByRole('button', { name: 'Reset demo data' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('payout form: empty, with errors, with a rate', async ({ page }) => {
    await open(page, '/payouts/new')
    await expectNoAxeViolations(page)
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('error-summary')).toBeVisible()
    await expectNoAxeViolations(page)
    await openPrefilledForm(page)
    await expectNoAxeViolations(page)
  })

  test('payout form: outcome unknown and accepted', async ({ page }) => {
    await openPrefilledForm(page, 'timeout-received')
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this payout')
    await expect(page.getByTestId('submission-status')).toBeFocused()
    await expectNoAxeViolations(page)
    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('submission-status')).toContainText('Received')
    await expectNoAxeViolations(page)
  })

  test('batch upload and batch result', async ({ page }) => {
    await open(page, '/batches/new?sample=1&simulate=partial-batch')
    await expect(page.getByTestId('batch-check-summary')).toBeVisible()
    await expectNoAxeViolations(page)
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('how it works', async ({ page }) => {
    await open(page, '/how-it-works')
    await expect(page.getByRole('heading', { name: 'Component API notes' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Security notes' })).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('not found', async ({ page }) => {
    await open(page, '/nothing-here')
    await expectNoAxeViolations(page)
  })

  test('navigation moves focus to the new page heading and sets the title', async ({ page }) => {
    await openDesk(page)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeFocused()
    await expect(page).toHaveTitle('How it works · Payout desk · Kestrel Commercial')
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' })).toHaveAttribute('aria-current', 'page')
  })

  test('reduced motion turns animation off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openDesk(page)
    await page.getByRole('button', { name: 'Request log' }).first().click()
    const drawer = page.getByRole('dialog', { name: 'Request log' })
    await expect(drawer).toBeVisible()
    expect(await drawer.evaluate((node) => getComputedStyle(node).animationName)).toBe('none')
  })
})

test.describe('phone, 390 pixels wide', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const pages = ['/', '/payouts/new?prefill=1', '/batches/new?sample=1', '/how-it-works', '/nothing-here']
  for (const path of pages) {
    test(`no sideways scroll and axe clean on ${path}`, async ({ page }) => {
      await open(page, path)
      if (path === '/') await expect(page.getByTestId('row-count')).toContainText('Showing 60')
      if (path.startsWith('/payouts')) await expect(page.getByTestId('quote')).toBeVisible()
      if (path.startsWith('/batches')) await expect(page.getByTestId('batch-check-summary')).toBeVisible()
      await expectNoSidewaysScroll(page)
      await expectNoAxeViolations(page)
      await expect(page.locator('footer')).toHaveText(FOOTER)
    })
  }

  test('the table is a list of cards, and a card opens the detail drawer', async ({ page }) => {
    await openDesk(page)
    const first = page.locator('tr[data-row]').first()
    await expect(first.locator('td[data-label="Target amount"]')).toBeVisible()
    await expect(first.locator('td[data-label="Rate"]')).toBeHidden()
    expect((await first.boundingBox())?.width).toBeLessThanOrEqual(390)

    await first.click()
    const drawer = page.getByRole('dialog', { name: 'Payout PO-48260' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('Status history')
    await expectNoSidewaysScroll(page)
    await expectNoAxeViolations(page)
    await drawer.getByRole('button', { name: 'Close' }).click()
    await expect(drawer).toHaveCount(0)
  })

  test('the menu, Simulate panel and batch result fit the screen', async ({ page }) => {
    await openDesk(page)
    await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'New payout' })).toBeVisible()
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByTestId('simulate-toggle').click()
    await expect(page.locator('#simulate-panel')).toBeVisible()
    await expectNoSidewaysScroll(page)
    await page.getByRole('radio', { name: 'Partial batch failure', exact: true }).check()
    await page.locator('#simulate-panel').getByRole('link', { name: 'Open the sample batch' }).click()
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toContainText('9 booked')
    await expectNoSidewaysScroll(page)
    await expectNoAxeViolations(page)
  })
})
