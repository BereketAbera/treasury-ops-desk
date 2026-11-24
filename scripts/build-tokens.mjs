// Reads tokens/tokens.json (the single source) and writes three files:
//   src/ds/tokens/_tokens.scss  SCSS variables, for places CSS variables cannot go (media queries)
//   src/ds/tokens/tokens.css    CSS custom properties on :root, used by every component
//   src/ds/tokens/tokens.ts     the same values as a typed object, for the docs pages
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'tokens/tokens.json'), 'utf8'))
const outDir = resolve(root, 'src/ds/tokens')
mkdirSync(outDir, { recursive: true })

const flat = []
for (const [group, values] of Object.entries(source)) {
  for (const [name, value] of Object.entries(values)) {
    flat.push({ group, name, key: `${group}-${name}`, value })
  }
}

const banner = 'Built from tokens/tokens.json by scripts/build-tokens.mjs. Edit the JSON, not this file.'

const scss = [`// ${banner}`, ...flat.map((t) => `$${t.key}: ${t.value};`), ''].join('\n')
const css = [`/* ${banner} */`, ':root {', ...flat.map((t) => `  --${t.key}: ${t.value};`), '}', ''].join('\n')
const ts = [
  `// ${banner}`,
  'export const tokens = ' + JSON.stringify(source, null, 2) + ' as const',
  '',
  'export type TokenGroup = keyof typeof tokens',
  '',
].join('\n')

writeFileSync(resolve(outDir, '_tokens.scss'), scss)
writeFileSync(resolve(outDir, 'tokens.css'), css)
writeFileSync(resolve(outDir, 'tokens.ts'), ts)
console.log(`tokens: wrote ${flat.length} values to src/ds/tokens`)
