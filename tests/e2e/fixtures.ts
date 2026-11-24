import AxeBuilder from '@axe-core/playwright'
import { expect, test as base, type Page, type Request } from '@playwright/test'

/**
 * Every test fails if the page throws, or if the browser reports a
 * Content-Security-Policy violation. The policy from vercel.json is applied by
 * the local preview server too, so this holds locally and on the live deploy.
 */
export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = []
      page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
      page.on('console', (message) => {
        const text = message.text()
        if (/content security policy|refused to (load|execute|apply|connect|frame)/i.test(text)) problems.push(`csp: ${text}`)
      })
      await use(problems)
      expect(problems, 'page errors and CSP violations').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function open(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('#page-title')).toBeVisible()
}

/** Opens the instruction table and waits for the first sync. */
export async function openDesk(page: Page, path = '/') {
  await open(page, path)
  await expect(page.getByTestId('row-count')).toContainText('Showing')
}

/** Opens a prefilled payout form and waits for the rate. */
export async function openPrefilledForm(page: Page, simulate?: string) {
  await open(page, `/payouts/new?prefill=1${simulate ? `&simulate=${simulate}` : ''}`)
  await expect(page.getByTestId('quote')).toBeVisible()
}

/** Records the requests the page sends to one API path. */
export function record(page: Page, method: string, path: string | RegExp): Request[] {
  const seen: Request[] = []
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    const matches = typeof path === 'string' ? pathname === path : path.test(pathname)
    if (request.method() === method && matches) seen.push(request)
  })
  return seen
}

export async function chooseScenario(page: Page, label: string) {
  const toggle = page.getByTestId('simulate-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await page.getByRole('radio', { name: label, exact: true }).check()
  await expect(toggle).toContainText(label)
  await page.keyboard.press('Escape')
}

export async function expectNoAxeViolations(page: Page) {
  // Let entrance animations finish first: a half-faded panel gives false contrast readings.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(' | ')})`)
  expect(summary).toEqual([])
}

export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, 'horizontal overflow in pixels').toBeLessThanOrEqual(0)
}

export const FOOTER = 'Sample by Bereket A. · fictional data'
