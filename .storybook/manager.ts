import { addons } from 'storybook/manager-api'
import theme from './theme'

addons.setConfig({ theme })

// Storybook ends every tab title with its own name. Name this library instead.
const LIBRARY = 'Payout desk components'
function renameTab() {
  const next = /^storybook\b/i.test(document.title) ? LIBRARY : document.title.replace(/Storybook$/, LIBRARY)
  if (next !== document.title) document.title = next
}
const title = document.querySelector('title')
if (title) new MutationObserver(renameTab).observe(title, { childList: true, characterData: true, subtree: true })
renameTab()
