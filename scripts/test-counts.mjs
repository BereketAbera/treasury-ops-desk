// Counts the tests from the test runners' own output, and writes the
// numbers to src/generated/test-counts.json. The "How it works" page reads that
// file, so it can never show a count the suite does not have.
//
//   node scripts/test-counts.mjs          write the file
//   node scripts/test-counts.mjs --check  fail if the file on disk is out of date
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'src/generated/test-counts.json')
const bin = (name) => resolve(root, 'node_modules/.bin', name)
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })

// Vitest: counted from a real run, because its listing folds tests that share a
// source line (one helper called for two components) into one. A failing test
// stops the count, so the page never reports tests that do not pass.
const reportFile = resolve(mkdtempSync(resolve(tmpdir(), 'test-counts-')), 'vitest.json')
try {
  execFileSync(bin('vitest'), ['run', '--reporter=json', `--outputFile=${reportFile}`], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] })
} catch {
  throw new Error('The unit and component tests did not pass, so they were not counted. Run: pnpm exec vitest run')
}
const report = JSON.parse(readFileSync(reportFile, 'utf8'))
const inFolder = (folder) =>
  report.testResults
    .filter((file) => file.name.replaceAll('\\', '/').includes(`/tests/${folder}/`))
    .reduce((sum, file) => sum + file.assertionResults.filter((test) => test.status === 'passed').length, 0)
const unit = inFolder('unit')
const component = inFolder('component')
if (unit + component !== report.numTotalTests) throw new Error('A Vitest test is skipped, or outside tests/unit and tests/component: update scripts/test-counts.mjs')

// Playwright: the JSON reporter lists every test once per browser project.
const listing = JSON.parse(run(bin('playwright'), ['test', '--list', '--reporter=json']))
const perProject = new Map(listing.config.projects.map((project) => [project.name, 0]))
const walk = (suite) => {
  for (const spec of suite.specs ?? []) for (const test of spec.tests) perProject.set(test.projectName, (perProject.get(test.projectName) ?? 0) + 1)
  for (const child of suite.suites ?? []) walk(child)
}
for (const suite of listing.suites) walk(suite)

const LABELS = { chromium: 'Chromium', firefox: 'Firefox', webkit: 'WebKit' }
const projects = [...perProject].map(([name, tests]) => ({ name, label: LABELS[name] ?? name, tests, smoke: name !== 'chromium' }))
const counts = { unit, component, endToEnd: { total: projects.reduce((sum, project) => sum + project.tests, 0), projects } }
if (unit === 0 || component === 0 || counts.endToEnd.total === 0) throw new Error(`A test runner listed no tests: ${JSON.stringify(counts)}`)

const text = `${JSON.stringify(counts, null, 2)}\n`
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text) {
    console.error('src/generated/test-counts.json is out of date. Run: pnpm test:counts')
    process.exit(1)
  }
  console.log('test counts are up to date')
} else {
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, text)
  console.log(`test counts: ${unit} unit, ${component} component, ${projects.map((project) => `${project.tests} end to end in ${project.label}`).join(', ')}`)
}
