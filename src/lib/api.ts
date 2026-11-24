import { newCorrelationId } from './ids'
import { backoffDelay, classifyStatus, shouldRetry, type FailureClass, type RetryPolicy } from './retry'

export interface ApiErrorBody {
  code: string
  message: string
  fields?: Record<string, string>
  correlationId?: string
}

export type ApiResult<T> =
  | { kind: 'ok'; status: number; data: T; replayed: boolean; correlationId: string }
  | { kind: 'error'; status: number; error: ApiErrorBody; failure: FailureClass; correlationId: string }
  | { kind: 'timeout'; correlationId: string; timeoutMs: number }
  | { kind: 'network'; correlationId: string; message: string }

export interface RequestOptions {
  method?: 'GET' | 'POST'
  path: string
  body?: unknown
  /** Sent as Idempotency-Key. Reuse the same key for every retry of one intent. */
  idempotencyKey?: string
  /** Sent as X-Correlation-Id. A new one is made when omitted. */
  correlationId?: string
  attempt?: number
  timeoutMs?: number
  /** Background sync requests are hidden from the request log by default. */
  background?: boolean
}

export interface RequestLogEntry {
  id: number
  startedAt: number
  method: string
  path: string
  /** HTTP status, or what happened when no response arrived. */
  status: number | 'timeout' | 'network error' | 'pending'
  durationMs: number | null
  attempt: number
  correlationId: string
  idempotencyKey: string | null
  replayed: boolean
  background: boolean
}

export interface ApiClientDeps {
  fetch?: typeof fetch
  now?: () => number
  onStart?: (entry: RequestLogEntry) => void
  onFinish?: (entry: RequestLogEntry) => void
}

export const DEFAULT_TIMEOUT_MS = 4_000

let sequence = 0

export function createApiClient(deps: ApiClientDeps = {}) {
  const now = deps.now ?? (() => Date.now())

  async function request<T>(options: RequestOptions): Promise<ApiResult<T>> {
    const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis)
    const method = options.method ?? 'GET'
    const correlationId = options.correlationId ?? newCorrelationId()
    const attempt = options.attempt ?? 1
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Correlation-Id': correlationId,
      'X-Attempt': String(attempt),
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey

    const entry: RequestLogEntry = {
      id: ++sequence,
      startedAt: now(),
      method,
      path: options.path,
      status: 'pending',
      durationMs: null,
      attempt,
      correlationId,
      idempotencyKey: options.idempotencyKey ?? null,
      replayed: false,
      background: options.background ?? false,
    }
    deps.onStart?.(entry)

    const finish = (patch: Partial<RequestLogEntry>) => {
      const done = { ...entry, ...patch, durationMs: now() - entry.startedAt }
      deps.onFinish?.(done)
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)

    try {
      const response = await doFetch(options.path, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      })
      const isJson = (response.headers.get('Content-Type') ?? '').includes('application/json')
      const payload: unknown = isJson ? await response.json() : null
      const replayed = response.headers.get('Idempotent-Replayed') === 'true'
      finish({ status: response.status, replayed })

      if (!isJson) {
        return {
          kind: 'error',
          status: response.status,
          failure: 'final',
          correlationId,
          error: { code: 'not_json', message: 'The API answered with something that is not JSON.', correlationId },
        }
      }
      const outcome = classifyStatus(response.status)
      if (outcome === 'ok') {
        return { kind: 'ok', status: response.status, data: payload as T, replayed, correlationId }
      }
      const body = (payload ?? {}) as Partial<ApiErrorBody>
      return {
        kind: 'error',
        status: response.status,
        failure: outcome,
        correlationId,
        error: {
          code: body.code ?? 'error',
          message: body.message ?? `Request failed with status ${response.status}.`,
          fields: body.fields,
          correlationId,
        },
      }
    } catch (error) {
      if (timedOut) {
        finish({ status: 'timeout' })
        return { kind: 'timeout', correlationId, timeoutMs }
      }
      finish({ status: 'network error' })
      return { kind: 'network', correlationId, message: error instanceof Error ? error.message : 'Network error' }
    } finally {
      clearTimeout(timer)
    }
  }

  return { request }
}

export type ApiClient = ReturnType<typeof createApiClient>

export function failureOf<T>(result: ApiResult<T>): FailureClass | null {
  switch (result.kind) {
    case 'ok':
      return null
    case 'error':
      return result.failure
    case 'timeout':
    case 'network':
      return 'unknown'
  }
}

export interface RetryHooks {
  /** Called before each attempt is sent. */
  onAttempt?: (attempt: number) => void
  /** Called when an attempt failed and another one is scheduled. */
  onBackoff?: (info: { failedAttempt: number; nextAttempt: number; delayMs: number; status: number }) => void
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  /** Attempt number of the first request, for manual retries that continue the count. */
  firstAttempt?: number
}

export interface RetryOutcome<T> {
  result: ApiResult<T>
  attempts: number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Sends one logical operation, retrying only when the server said it did not do
 * the work. Every attempt carries the same correlation ID and, when given, the
 * same idempotency key. A timeout is returned at once: the caller must check
 * status before sending again.
 */
export async function sendWithRetry<T>(
  client: ApiClient,
  options: RequestOptions,
  policy: RetryPolicy,
  hooks: RetryHooks = {},
): Promise<RetryOutcome<T>> {
  const sleep = hooks.sleep ?? defaultSleep
  const correlationId = options.correlationId ?? newCorrelationId()
  const first = hooks.firstAttempt ?? 1
  let made = 0

  for (;;) {
    const attempt = first + made
    hooks.onAttempt?.(attempt)
    const result = await client.request<T>({ ...options, correlationId, attempt })
    made += 1
    const failure = failureOf(result)
    if (failure === null || result.kind !== 'error' || !shouldRetry(failure, made, policy)) {
      return { result, attempts: first + made - 1 }
    }
    const delayMs = backoffDelay(made, policy, hooks.random)
    hooks.onBackoff?.({ failedAttempt: attempt, nextAttempt: attempt + 1, delayMs, status: result.status })
    await sleep(delayMs)
  }
}
