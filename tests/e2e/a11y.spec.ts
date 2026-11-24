import { readFileSync } from 'node:fs'
import { chooseScenario, expect, expectInView, expectNoAxeViolations, expectNoSidewaysScroll, FOOTER, open, openDesk, openPrefilledForm, test } from './fixtures'

test.describe('accessibility: axe on every page and state', () => {
  test('instruction table', { tag: '@smoke' }, async ({ page }) => {
    await openDesk(page)
    await expectNoAxeViolations(page)
    await page.getByTestId('summary-totals').locator('summary').click()
    await expect(page.getByTestId('summary-totals')).toContainText('NGN')
    await expectNoAxeViolations(page)
  })

  test('instruction table before anything has loaded, and with a missing selection', async ({ page }) => {
    await openDesk(page, '/?selected=PO-99999')
    await expect(page.getByTestId('selected-missing')).toBeVisible()
    await expectNoAxeViolations(page)
    await chooseScenario(page, 'Polling outage')
    await expect(page.getByTestId('stale-banner')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('never-loaded-banner')).toBeVisible()
    await expectNoAxeViolations(page)
  })

  test('batches list, empty and with a batch', async ({ page }) => {
    await open(page, '/batches')
    await expect(page.getByTestId('batches-empty')).toBeVisible()
    await expectNoAxeViolations(page)
    await open(page, '/batches/new?sample=1')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('batch-summary')).toBeVisible()
    await open(page, '/batches')
    await expect(page.getByTestId('batches-table')).toBeVisible()
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
    // On the instruction table, so the table's sync polls are running.
    await page.getByTestId('submission-status').getByRole('link', { name: 'View in the instruction table' }).click()
    await expect(page.getByTestId('row-count')).toContainText('Showing 61')
    const opener = page.getByRole('button', { name: 'Request log' }).first()
    await opener.click()
    const drawer = page.getByRole('dialog', { name: 'Request log' })
    await expect(drawer).toBeVisible()
    await expect(drawer).toBeFocused()
    await expect(page.getByTestId('request-log')).toContainText('/api/payouts')
    await expect(page.getByTestId('request-log')).toContainText('cor_')
    // Table sync polls are one summary line. They are listed only when asked for, and never among the operator's requests.
    await expect(page.getByTestId('poll-summary')).toContainText(/Polling: \d+ requests?, last 200 at \d\d:\d\d:\d\d/)
    await expect(page.getByTestId('poll-rows')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Main' }).locator('.rail__count')).toHaveText('2')
    await expectNoAxeViolations(page)

    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((node) => node.contains(document.activeElement))).toBe(true)
    }
    await drawer.getByLabel('Show the last table sync requests').check()
    await expect(drawer.getByLabel('Show the last table sync requests')).toBeChecked()
    await expect(page.getByTestId('poll-rows').locator('tr').first()).toContainText('/api/payouts')
    await expectNoAxeViolations(page)
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

  test('batch upload: outcome unknown, and not received', async ({ page }) => {
    await open(page, '/batches/new?sample=1&simulate=timeout-lost')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this batch', { timeout: 15_000 })
    await expectNoAxeViolations(page)
    await page.getByTestId('check-status').click()
    await expect(page.getByTestId('submission-status')).toContainText('Not received, safe to resend')
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
    await expect(page.getByRole('heading', { name: 'Accessibility', exact: true })).toBeVisible()
    await expect(page.locator('#accessibility')).toContainText('wcag21aa')
    await expectNoAxeViolations(page)
  })

  test('the test counts on the page are the ones the test runners report', async ({ page }) => {
    const counts = JSON.parse(readFileSync(new URL('../../src/generated/test-counts.json', import.meta.url), 'utf8')) as {
      unit: number
      component: number
      endToEnd: { projects: { name: string; tests: number }[] }
    }
    await open(page, '/how-it-works')
    await expect(page.getByTestId('count-unit')).toHaveText(String(counts.unit))
    await expect(page.getByTestId('count-component')).toHaveText(String(counts.component))
    for (const project of counts.endToEnd.projects) {
      await expect(page.getByTestId(`count-e2e-${project.name}`)).toHaveText(String(project.tests))
    }
    // The file is generated, so this run must be one of the counted ones.
    const running = test.info().config.projects.map((project) => project.name)
    expect(counts.endToEnd.projects.map((project) => project.name)).toEqual(running)
  })

  test('not found', async ({ page }) => {
    await open(page, '/nothing-here')
    await expectNoAxeViolations(page)
  })

  test('navigation moves focus to the new page heading and sets the title', async ({ page }) => {
    await openDesk(page)
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'How it works' })).toBeFocused()
    await expect(page).toHaveTitle('How it works · Payout desk · Quillmere Commercial')
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

  const pages = ['/', '/payouts/new?prefill=1', '/batches', '/batches/new?sample=1', '/how-it-works', '/nothing-here']
  for (const path of pages) {
    test(`no sideways scroll and axe clean on ${path}`, { tag: path === '/' ? '@smoke' : [] }, async ({ page }) => {
      await open(page, path)
      if (path === '/') await expect(page.getByTestId('row-count')).toContainText('Showing 15 of 60')
      if (path.startsWith('/payouts')) await expect(page.getByTestId('quote')).toBeVisible()
      if (path.startsWith('/batches/new')) await expect(page.getByTestId('batch-check-summary')).toBeVisible()
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

    // The batch result is stacked as cards: the reason, the next step and the action are on screen, not in a sideways scroller.
    const rejected = page.getByTestId('group-rejected')
    for (const label of ['Reason', 'Next step']) {
      const cell = rejected.locator(`tbody tr td[data-label="${label}"]`).first()
      await cell.scrollIntoViewIfNeeded()
      const box = await cell.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 390, `${label} is inside the screen`).toBe(true)
    }
    const check = page.getByTestId('check-item')
    await check.scrollIntoViewIfNeeded()
    const box = await check.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= 390 && box.height >= 44).toBe(true)
    expect(await rejected.getByRole('region').evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true)
  })

  test('the list shows 15 cards at a time with one count line and a "Show more" button', async ({ page }) => {
    await openDesk(page)
    const cards = page.locator('tr[data-row]')
    const count = page.getByTestId('row-count')
    await expect(cards).toHaveCount(15)
    await expect(count).toHaveText('Showing 15 of 60 instructions')
    await expect(page.getByRole('main').getByText(/\d+ of \d+/)).toHaveCount(1)
    await page.getByTestId('show-more').click()
    await expect(cards).toHaveCount(30)
    await expect(count).toHaveText('Showing 30 of 60 instructions')
    await expect(cards.nth(15)).toBeFocused()

    await page.getByLabel('Status').selectOption('completed')
    await expect(cards).toHaveCount(15)
    await expect(count).toHaveText(/^Showing 15 of \d+ matching instructions, 60 in all$/)
    await page.getByLabel('Status').selectOption('failed')
    await expect(cards).toHaveCount(5)
    await expect(page.getByTestId('show-more')).toHaveCount(0)
    await expect(count).toHaveText('Showing 5 of 60 instructions')
  })

  test('a submit with errors brings the error summary into view', { tag: '@smoke' }, async ({ page }) => {
    await open(page, '/payouts/new')
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('error-summary')).toBeFocused()
    await expectInView(page, page.getByTestId('error-summary'))
  })

  test('outcome unknown, for a payout and for a batch: no sideways scroll and axe clean', async ({ page }) => {
    await openPrefilledForm(page, 'timeout-received')
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this payout')
    await expectNoSidewaysScroll(page)
    await expectNoAxeViolations(page)
    await open(page, '/batches/new?sample=1&simulate=batch-timeout')
    await page.getByTestId('submit-batch').click()
    await expect(page.getByTestId('submission-status')).toContainText('We could not confirm this batch', { timeout: 15_000 })
    await expectNoSidewaysScroll(page)
    await expectNoAxeViolations(page)
  })

  test('the list can be sorted from a labelled select, and the hidden header row takes no focus', async ({ page }) => {
    await openDesk(page)
    await expect(page.locator('.ds-table thead')).toBeHidden()
    const sort = page.getByLabel('Sort by')
    await expect(sort).toBeVisible()
    await expect(sort).toHaveValue('created:desc')
    await sort.selectOption({ label: 'Beneficiary, ascending' })
    await expect(page).toHaveURL(/sort=beneficiary(%3A|:)asc/)
    const names = await page.locator('tr[data-row] td[data-label="Beneficiary"]').allTextContents()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    await expect(sort).toHaveValue('beneficiary:asc')
  })

  test('every Tab stop on the home page has a visible focus indicator', async ({ page }) => {
    await openDesk(page)
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    const stops: string[] = []
    const problems: string[] = []
    for (let index = 0; index < 60; index += 1) {
      await page.keyboard.press('Tab')
      const stop = await page.evaluate(() => {
        const node = document.activeElement
        if (!node || node === document.body) return null
        const box = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        // Some controls show their ring on a wrapper or on the label beside them.
        const ringOwner = [node, node.parentElement, node.nextElementSibling].find((candidate) => {
          if (!candidate) return false
          const look = getComputedStyle(candidate)
          return (look.outlineStyle !== 'none' && parseFloat(look.outlineWidth) >= 2) || look.boxShadow !== 'none'
        })
        const name = `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''} "${(node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 30)}"`
        const onScreen = box.width >= 1 && box.height >= 1 && box.right > 0 && box.left < window.innerWidth
        const shown = style.visibility !== 'hidden' && style.display !== 'none' && node.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
        const clipped = style.clipPath !== 'none' || (box.width <= 1 && box.height <= 1)
        return { name, ok: onScreen && shown && !clipped && Boolean(ringOwner), inHead: Boolean(node.closest('thead')) }
      })
      if (!stop) break
      if (stops.includes(stop.name) && stops[0] === stop.name) break
      stops.push(stop.name)
      if (!stop.ok || stop.inHead) problems.push(stop.name)
    }
    expect(stops.length).toBeGreaterThan(10)
    expect(problems, `stops without a visible focus indicator, of ${stops.length}`).toEqual([])
  })

  test('controls are at least 44 pixels high, and icon buttons 44 wide', async ({ page }) => {
    const small = async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('button, select, input:not([type=radio]):not([type=checkbox]):not([hidden]):not(.ds-money__input), .ds-money, a.ds-button, summary, .rail__link'))
          .filter((node) => node.checkVisibility() && node.getBoundingClientRect().width > 0)
          .filter((node) => {
            const box = node.getBoundingClientRect()
            const iconOnly = node.matches('.ds-copy, .ds-banner__dismiss, .ds-icon-button')
            return box.height < 43.5 || (iconOnly && box.width < 43.5)
          })
          .map((node) => `${node.tagName.toLowerCase()}.${node.className} "${(node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 24)}" ${Math.round(node.getBoundingClientRect().height)}`),
      )
    await openDesk(page)
    expect(await small(), 'home').toEqual([])
    await page.getByRole('button', { name: 'Menu' }).click()
    expect(await small(), 'menu open').toEqual([])
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.locator('tr[data-row]').first().click()
    await expect(page.getByRole('dialog', { name: 'Payout PO-48260' })).toBeVisible()
    expect(await small(), 'detail drawer').toEqual([])
    await page.keyboard.press('Escape')
    await open(page, '/payouts/new?prefill=1')
    await expect(page.getByTestId('quote')).toBeVisible()
    expect(await small(), 'payout form').toEqual([])
  })

  test('the request log stacks its rows, so the correlation ID and idempotency key are on screen', async ({ page }) => {
    await openPrefilledForm(page)
    await page.getByTestId('submit-payout').click()
    await expect(page.getByTestId('submission-status')).toContainText('Payout accepted')
    await page.getByRole('button', { name: 'Request log' }).first().click()
    const log = page.getByTestId('request-log')
    for (const label of ['Correlation ID', 'Idempotency key']) {
      const cell = log.locator(`tbody tr td[data-label="${label}"]`).first()
      await cell.scrollIntoViewIfNeeded()
      const box = await cell.boundingBox()
      expect(box && box.x >= 0 && box.x + box.width <= 390, `${label} is inside the screen`).toBe(true)
    }
    await expectNoAxeViolations(page)
  })
})

test.describe('request log drawer height', () => {
  test('the drawer is as tall as its content, not a fixed half of the screen', async ({ page }) => {
    await openDesk(page)
    await page.getByRole('button', { name: 'Request log' }).first().click()
    const drawer = page.getByRole('dialog', { name: 'Request log' })
    await expect(drawer).toBeVisible()
    const short = (await drawer.boundingBox())?.height ?? 0
    expect(short).toBeLessThan(300)
    await drawer.getByLabel('Show the last table sync requests').check()
    await expect(page.getByTestId('poll-rows').locator('tr').first()).toBeVisible()
    expect((await drawer.boundingBox())?.height ?? 0).toBeLessThanOrEqual(560)
  })
})
