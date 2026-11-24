import { expect, open, test } from './fixtures'

test.describe('headers, storage and Storybook', () => {
  test('app pages are served with a strict Content-Security-Policy and the other security headers', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response?.headers() ?? {}
    const csp = headers['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['referrer-policy']).toBe('no-referrer')
  })

  test('state is kept in sessionStorage only and nothing is written to localStorage', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: Object.keys(sessionStorage) }))
    expect(storage.local).toBe(0)
    expect(storage.session).toContain('kc.db.v1')
  })

  test('requests are visible to the browser with their headers', async ({ page }) => {
    const seen: Record<string, string>[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/payouts') seen.push(request.headers())
    })
    await open(page, '/')
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]?.['x-correlation-id']).toMatch(/^cor_/)
    expect(seen[0]?.['x-attempt']).toBe('1')
  })

  test('Storybook is served under /storybook/ with the component library', async ({ page }) => {
    await page.goto('/storybook/')
    await expect(page).toHaveTitle(/Storybook/)
    await expect(page.locator('#storybook-explorer-tree')).toContainText('Components')
    await expect(page.locator('#storybook-explorer-tree')).toContainText('Foundations')
  })

  test('a story renders on its own page', async ({ page }) => {
    await page.goto('/storybook/iframe.html?id=components-statusbadge--every-status&viewMode=story')
    await expect(page.locator('.ds-badge')).toHaveCount(14)
    await expect(page.getByText('Outcome unknown', { exact: true })).toBeVisible()
    await page.goto('/storybook/iframe.html?id=components-moneyinput--zero-decimals&viewMode=story')
    await page.getByLabel('Amount the beneficiary receives').fill('7450000.5')
    await expect(page.getByText('too_many_decimals')).toBeVisible()
    await page.getByLabel('Amount the beneficiary receives').fill('7450000')
    await expect(page.getByText('"7450000"')).toBeVisible()
  })

  test('the Components link in the rail opens Storybook', async ({ page }) => {
    await open(page, '/how-it-works')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Components' }).click()
    await expect(page).toHaveURL(/\/storybook\/(\?.*)?$/)
    await expect(page).toHaveTitle(/Storybook/)
  })
})

test.describe('without service workers', () => {
  test.use({ serviceWorkers: 'block' })

  test('the page says plainly that the sample API could not start', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'The sample API could not start' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Open this page in a normal window.')).toBeVisible()
    await expect(page.getByText('Sample by Bereket A. · fictional data')).toBeVisible()
  })
})
