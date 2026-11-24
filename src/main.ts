import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './ds/tokens/tokens.css'
import { connectRequestLog } from './lib/http'
import { loadMockWorker, loadScenario } from './demo'
import { createAppRouter } from './router'
import { useRequestLogStore } from './stores/requestLog'
import './styles/main.scss'

const RELOAD_FLAG = 'qc.boot.reloaded'
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function apiAnswers(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    if (!response.ok || !(response.headers.get('Content-Type') ?? '').includes('application/json')) return false
    const body = (await response.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

/**
 * Starts the mock API and waits until it really answers. On a first visit the
 * service worker has to install and take control of the page before any
 * request can be answered, so the app is not mounted until a probe succeeds.
 */
async function startMockApi(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const { worker } = await loadMockWorker()
    // Where service workers are blocked, registration can reject or never settle. Do not wait for ever.
    const started = worker.start({ onUnhandledFrame: 'bypass', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } })
    const gaveUp = sleep(8_000).then(() => {
      throw new Error('The mock API worker did not start in time')
    })
    await Promise.race([started, gaveUp])
  } catch {
    return false
  }
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (await apiAnswers()) return true
    await sleep(120)
  }
  return false
}

function showUnavailable() {
  const root = document.getElementById('app')
  if (!root) return
  const box = document.createElement('main')
  box.className = 'boot-message'
  const title = document.createElement('h1')
  title.textContent = 'The sample API could not start'
  const text = document.createElement('p')
  text.textContent =
    'Payout desk answers its API calls with a service worker in your browser. Service workers are unavailable here, which happens in some private windows. Open this page in a normal window.'
  const footer = document.createElement('p')
  footer.textContent = 'Sample by Bereket A. · fictional data'
  box.append(title, text, footer)
  root.replaceChildren(box)
}

async function boot() {
  const ready = await startMockApi()
  if (!ready) {
    // A hard reload leaves the page outside the service worker's control, and a tab left open across a
    // deploy can ask for a chunk that no longer exists. One plain reload fixes both.
    let alreadyReloaded: boolean
    try {
      alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1'
      if (!alreadyReloaded) sessionStorage.setItem(RELOAD_FLAG, '1')
    } catch {
      alreadyReloaded = true
    }
    if (!alreadyReloaded && 'serviceWorker' in navigator) {
      window.location.reload()
      return
    }
    showUnavailable()
    return
  }
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // Storage blocked: nothing to clear.
  }

  loadScenario()
  const pinia = createPinia()
  const app = createApp(App)
  app.use(pinia)
  connectRequestLog(useRequestLogStore(pinia))
  app.use(createAppRouter())
  app.mount('#app')
}

void boot()
