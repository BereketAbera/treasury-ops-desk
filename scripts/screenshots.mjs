// Takes the reference screenshots of a running copy of the app.
//   node scripts/screenshots.mjs <base url> <output folder>
// It also prints every console error and Content-Security-Policy report it sees.
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const base = (process.argv[2] ?? 'http://localhost:3401').replace(/\/$/, '')
const out = resolve(process.argv[3] ?? 'screens')
const prefix = 'treasury-ops-desk'
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const problems = []

async function shot(name, { width = 1440, height = 900, fullPage = false }, steps) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => problems.push(`${name}: page error: ${error.message}`))
  page.on('console', (message) => {
    // The browser logs each simulated 503 as a failed resource. Those are expected here.
    const expected = /status of 503/.test(message.text())
    if (message.type() === 'error' && !expected) problems.push(`${name}: console error: ${message.text()}`)
  })
  await steps(page)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
  await page.screenshot({ path: resolve(out, `${prefix}-${name}.png`), fullPage })
  console.log(`saved ${prefix}-${name}.png`)
  await context.close()
}

const tableReady = (page) => page.getByTestId('row-count').filter({ hasText: 'Showing' }).waitFor()
const rateReady = (page) => page.getByTestId('quote').waitFor()

await shot('home-desktop', {}, async (page) => {
  await page.goto(`${base}/`)
  await tableReady(page)
})

await shot('home-1024', { width: 1024, height: 768 }, async (page) => {
  await page.goto(`${base}/`)
  await tableReady(page)
})

await shot('home-phone', { width: 390, height: 844, fullPage: true }, async (page) => {
  await page.goto(`${base}/`)
  await tableReady(page)
})

await shot('new-payout-desktop', {}, async (page) => {
  await page.goto(`${base}/payouts/new?prefill=1`)
  await rateReady(page)
})

await shot('unknown-outcome-desktop', {}, async (page) => {
  await page.goto(`${base}/payouts/new?prefill=1&simulate=timeout-received`)
  await rateReady(page)
  await page.getByTestId('submit-payout').click()
  await page.getByTestId('check-status').waitFor()
})

await shot('batch-result-desktop', {}, async (page) => {
  await page.goto(`${base}/batches/new?sample=1&simulate=partial-batch`)
  await page.getByTestId('submit-batch').click()
  await page.getByTestId('batch-summary').waitFor()
})

await shot('batch-result-phone', { width: 390, height: 844, fullPage: true }, async (page) => {
  await page.goto(`${base}/batches/new?sample=1&simulate=partial-batch`)
  await page.getByTestId('submit-batch').click()
  await page.getByTestId('batch-summary').waitFor()
})

await shot('request-log-desktop', {}, async (page) => {
  await page.goto(`${base}/payouts/new?prefill=1&simulate=fail-503`)
  await rateReady(page)
  await page.getByTestId('submit-payout').click()
  await page.getByTestId('retry-same-key').click()
  await page.getByText('Payout accepted').waitFor()
  await page.getByRole('link', { name: 'View in the instruction table' }).click()
  await tableReady(page)
  await page.getByRole('button', { name: 'Request log' }).first().click()
  await page.getByTestId('request-log').waitFor()
})

await shot('how-it-works-desktop', {}, async (page) => {
  await page.goto(`${base}/how-it-works`)
  await page.getByRole('heading', { name: 'Real and simulated' }).waitFor()
})

await shot('storybook-desktop', {}, async (page) => {
  await page.goto(`${base}/storybook/?path=/story/components-statusbadge--every-status`)
  await page.frameLocator('#storybook-preview-iframe').getByText('Outcome unknown', { exact: true }).waitFor()
})

await browser.close()
if (problems.length > 0) {
  console.log(`\n${problems.length} console problems:`)
  for (const problem of problems) console.log(` - ${problem}`)
  process.exitCode = 1
} else {
  console.log('\nno console errors on any page')
}
