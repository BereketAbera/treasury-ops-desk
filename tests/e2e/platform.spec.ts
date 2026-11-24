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

  test('the HTML and the worker script are always revalidated, and hashed assets are cached for good', async ({ page, request }) => {
    const html = await request.get('/')
    expect(html.headers()['cache-control']).toMatch(/no-cache|max-age=0/)
    const deep = await request.get('/payouts/new')
    expect(deep.headers()['cache-control']).toMatch(/no-cache|max-age=0/)
    const worker = await request.get('/mockServiceWorker.js')
    expect(worker.status()).toBe(200)
    expect(worker.headers()['cache-control']).toMatch(/no-cache|max-age=0/)

    await page.goto('/')
    const assets = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel=stylesheet]')).map((node) => ('src' in node ? node.src : node.href)))
    expect(assets.length).toBeGreaterThan(0)
    for (const url of assets) {
      expect(new URL(url).pathname).toMatch(/^\/assets\/.+-[\w-]{8,}\.(js|css)$/)
      const asset = await request.get(url)
      expect(asset.status()).toBe(200)
      expect(asset.headers()['cache-control'], url).toContain('immutable')
      expect(asset.headers()['cache-control'], url).toContain('max-age=31536000')
    }
  })

  test('values edited by hand in sessionStorage do not break a page', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
    await page.evaluate(() => {
      sessionStorage.setItem('qc.form.payout.v2', JSON.stringify({ draft: {} }))
      sessionStorage.setItem('qc.requestlog.v2', JSON.stringify({ not: 'a log' }))
      sessionStorage.setItem('qc.prefs.v1', JSON.stringify(['compact']))
      sessionStorage.setItem('qc.scenario.v1', '"polling-outage"')
      sessionStorage.setItem('qc.db.v1', JSON.stringify({ version: 1, payouts: 'none' }))
    })
    await page.reload()
    await expect(page.getByTestId('row-count')).toHaveText('Showing 60 of 60 instructions')
    await page.getByRole('button', { name: 'Request log' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Request log' })).toContainText('No requests yet')
    await page.keyboard.press('Escape')
    await open(page, '/payouts/new')
    await expect(page.getByLabel('Your reference')).toHaveValue('')
    await expect(page.getByTestId('submission-status')).toContainText('Nothing sent yet')
    await open(page, '/batches')
    await expect(page.getByTestId('batches-empty')).toBeVisible()
  })

  test('state is kept in sessionStorage only and nothing is written to localStorage', async ({ page }) => {
    await open(page, '/')
    await expect(page.getByTestId('row-count')).toContainText('Showing 60')
    const storage = await page.evaluate(() => ({ local: localStorage.length, session: Object.keys(sessionStorage) }))
    expect(storage.local).toBe(0)
    expect(storage.session).toContain('qc.db.v1')
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

  test('every screen names its environment, and the page has an icon and a social preview that load', async ({ page, request }) => {
    await open(page, '/')
    await expect(page.getByTestId('environment')).toHaveText('Sandbox · mock API')
    await page.goto('/how-it-works')
    await expect(page.getByTestId('environment')).toBeVisible()

    const image = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(image).toMatch(/^https:\/\/.+\/social\.png$/)
    expect(await page.locator('meta[name="twitter:image"]').getAttribute('content')).toBe(image)
    expect(await page.locator('meta[name="twitter:card"]').getAttribute('content')).toBe('summary_large_image')
    // The tag carries the deployed address. The file itself is checked on the address under test.
    for (const [path, type] of [
      ['/social.png', 'image/png'],
      ['/favicon.svg', 'image/svg+xml'],
      ['/favicon-48.png', 'image/png'],
      ['/apple-touch-icon.png', 'image/png'],
    ] as const) {
      const response = await request.get(path)
      expect(response.status(), path).toBe(200)
      expect(response.headers()['content-type'], path).toContain(type)
    }
  })

  test('Storybook carries the product name and colours, and no optional text prop shows a "Set string" button', async ({ page }) => {
    await page.goto('/storybook/?path=/story/components-statusbadge--one')
    await expect(page).toHaveTitle(/Payout desk components$/)
    await expect(page.getByRole('img', { name: 'Payout desk component library' })).toBeVisible()
    await expect(page.getByPlaceholder('Edit string...')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Set string' })).toHaveCount(0)
    // An empty text box means "not set": the badge keeps its own label.
    await expect(page.frameLocator('#storybook-preview-iframe').locator('#storybook-root')).toHaveText('Completed')
  })

  test('Storybook is served under /storybook/ with the component library', async ({ page }) => {
    await page.goto('/storybook/')
    await expect(page).toHaveTitle(/Payout desk components/)
    await expect(page.locator('#storybook-explorer-tree')).toContainText('Components')
    await expect(page.locator('#storybook-explorer-tree')).toContainText('Foundations')
    // One group per component, each with a plain name.
    const tree = page.locator('#storybook-explorer-tree')
    for (const name of ['Amount', 'Banner', 'Button', 'CopyButton', 'Countdown', 'DataTable', 'Dialog', 'Drawer', 'Field', 'Icon', 'MoneyInput', 'Rate', 'Segmented', 'Select', 'StatusBadge', 'TextInput']) {
      await expect(tree.getByRole('button', { name, exact: true }).or(tree.getByRole('link', { name, exact: true })).first(), name).toBeVisible()
    }
    await expect(tree).not.toContainText('Field, TextInput')
    await expect(tree).not.toContainText('Drawer and Dialog')
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
