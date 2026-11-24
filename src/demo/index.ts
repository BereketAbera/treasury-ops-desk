// DEMO ONLY.
//
// This file is the one door between the app and the mock API's Simulate
// control. App code (router, pages, stores, components) imports demo behaviour
// from here and from nowhere else under src/mocks. A production build would
// delete this folder, src/mocks, the Simulate menu and the two calls in
// main.ts, and nothing else would need to change.

import type { ApiClient, ApiResult, RequestOptions } from '@/lib/api'
import { consume, isActive, isScenarioId, setScenario } from '@/mocks/scenario'

export {
  findScenario,
  getScenario,
  loadScenario,
  onScenarioChange,
  SCENARIOS,
  setScenario,
  type Scenario,
  type ScenarioId,
} from '@/mocks/scenario'

/** Loads the mock API worker as its own chunk, so the app's code and the mock's code stay apart. */
export function loadMockWorker() {
  return import('@/mocks/browser')
}

/** A link can arm a scenario: /payouts/new?simulate=fail-503. Returns true when the value named one. */
export function armScenarioFromQuery(value: unknown): boolean {
  if (!isScenarioId(value)) return false
  setScenario(value)
  return true
}

export function resetScenario(): void {
  setScenario('normal')
}

/**
 * Wraps the API client for the "Duplicate submit" scenario. While that scenario
 * is armed, an accepted payout submit is sent a second time with the same
 * idempotency key, and the caller gets the second answer: the API's replay of
 * the first. Every other request passes straight through.
 */
export function withDuplicateSubmit(client: ApiClient): ApiClient {
  return {
    async request<T>(options: RequestOptions): Promise<ApiResult<T>> {
      const first = await client.request<T>(options)
      const isPayoutSubmit = options.method === 'POST' && options.path === '/api/payouts'
      if (!isPayoutSubmit || first.kind !== 'ok' || first.replayed) return first
      if (!isActive('duplicate') || !consume('duplicate')) return first
      const second = await client.request<T>({ ...options, attempt: (options.attempt ?? 1) + 1 })
      return second.kind === 'ok' ? second : first
    },
  }
}
