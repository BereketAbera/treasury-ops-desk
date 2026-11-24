import { createApiClient, type RequestLogEntry } from './api'

// The app's one API client. The request log store plugs itself in at start-up,
// so every request made through here is recorded.

interface LogSink {
  onStart(entry: RequestLogEntry): void
  onFinish(entry: RequestLogEntry): void
}

let sink: LogSink | null = null

export function connectRequestLog(next: LogSink | null): void {
  sink = next
}

export const api = createApiClient({
  onStart: (entry) => sink?.onStart(entry),
  onFinish: (entry) => sink?.onFinish(entry),
})
