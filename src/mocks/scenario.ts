// The Simulate control. The mock API reads the active scenario on every
// request; one-shot scenarios switch back to "normal" once they have fired.

export type ScenarioId =
  | 'normal'
  | 'slow'
  | 'timeout-received'
  | 'timeout-lost'
  | 'fail-503'
  | 'duplicate'
  | 'short-quote'
  | 'partial-batch'
  | 'batch-timeout'
  | 'polling-outage'

export interface Scenario {
  id: ScenarioId
  label: string
  /** One line: what to watch. */
  watch: string
  /** Stays on until changed; otherwise fires once. */
  sticky: boolean
  /** How many requests a one-shot scenario affects. */
  shots: number
  /** Where to go to see it. */
  tryPath: string
  tryLabel: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'normal',
    label: 'Normal',
    watch: 'Every request is answered in under half a second.',
    sticky: true,
    shots: 0,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'slow',
    label: 'Slow network',
    watch: 'Every answer takes about two seconds. Watch the loading states and the durations in the request log.',
    sticky: true,
    shots: 0,
    tryPath: '/',
    tryLabel: 'Open the instruction table',
  },
  {
    id: 'timeout-received',
    label: 'Next submit times out, payout received',
    watch: 'The answer never arrives. The form says the outcome is unknown and offers Check status, not a resend. The check finds the payout. Acts on a single payout submit, not on a batch.',
    sticky: false,
    shots: 1,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'timeout-lost',
    label: 'Next submit times out, payout not received',
    watch: 'Same timeout, but the request never reached the API. Check status finds nothing and only then offers a resend with the same key. Acts on a single payout submit, not on a batch.',
    sticky: false,
    shots: 1,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'fail-503',
    label: 'Next submit fails with 503',
    watch: 'Three attempts fail with a backoff between them and a visible attempt count. The manual retry then goes through with the same key. Acts on the next payout submit or batch submit.',
    sticky: false,
    shots: 3,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'duplicate',
    label: 'Duplicate submit',
    watch: 'The form sends the same request twice with one key. The second answer is a replay: one payout exists, and the form says it was not sent twice. Acts on a single payout submit, not on a batch.',
    sticky: false,
    shots: 1,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'short-quote',
    label: 'Next rate expires in 6 seconds',
    watch: 'The countdown reaches zero, Submit locks, and the form asks for a fresh rate.',
    sticky: false,
    shots: 1,
    tryPath: '/payouts/new?prefill=1',
    tryLabel: 'Open a prefilled payout',
  },
  {
    id: 'partial-batch',
    label: 'Partial batch failure',
    watch: 'A batch of 12 comes back as 9 booked, 2 rejected and 1 outcome unknown. Retry sends only the 2 rejected.',
    sticky: false,
    shots: 1,
    tryPath: '/batches/new?sample=1',
    tryLabel: 'Open the sample batch',
  },
  {
    id: 'batch-timeout',
    label: 'Next batch submit times out, batch received',
    watch: 'The batch is booked, but the answer never arrives. The page says the outcome is unknown and lists the batch under Recent batches. Submitting again reuses the key and gets the first result.',
    sticky: false,
    shots: 1,
    tryPath: '/batches/new?sample=1',
    tryLabel: 'Open the sample batch',
  },
  {
    id: 'polling-outage',
    label: 'Polling outage',
    watch: 'The table sync fails. The table keeps its rows, marks them as possibly out of date, and backs off between tries.',
    sticky: true,
    shots: 0,
    tryPath: '/',
    tryLabel: 'Open the instruction table',
  },
]

const STORAGE_KEY = 'qc.scenario.v1'

interface State {
  id: ScenarioId
  shotsLeft: number
}

type Listener = (state: Readonly<State>) => void

let state: State = { id: 'normal', shotsLeft: 0 }
const listeners = new Set<Listener>()

export function isScenarioId(value: unknown): value is ScenarioId {
  return typeof value === 'string' && SCENARIOS.some((scenario) => scenario.id === value)
}

export function findScenario(id: ScenarioId): Scenario {
  const found = SCENARIOS.find((scenario) => scenario.id === id)
  if (!found) throw new Error(`Unknown scenario ${id}`)
  return found
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable (private mode quotas). The scenario still works in memory.
  }
  listeners.forEach((listener) => listener(state))
}

export function loadScenario(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return
    const { id, shotsLeft } = parsed as Partial<State>
    if (isScenarioId(id)) state = { id, shotsLeft: Math.max(0, Math.floor(Number(shotsLeft) || 0)) }
  } catch {
    state = { id: 'normal', shotsLeft: 0 }
  }
}

export function getScenario(): Readonly<State> {
  return state
}

export function setScenario(id: ScenarioId): void {
  state = { id, shotsLeft: findScenario(id).shots }
  persist()
}

export function isActive(id: ScenarioId): boolean {
  return state.id === id
}

/** Uses one shot of a one-shot scenario. Returns true when the scenario applied. */
export function consume(id: ScenarioId): boolean {
  if (state.id !== id) return false
  const left = state.shotsLeft - 1
  state = left > 0 ? { id, shotsLeft: left } : { id: 'normal', shotsLeft: 0 }
  persist()
  return true
}

export function onScenarioChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
