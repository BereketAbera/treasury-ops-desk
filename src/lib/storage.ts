// Session storage only: state lasts for the tab and nothing is written to localStorage.
//
// Whatever comes back from storage is untrusted: it may be from an older build,
// cut short, or edited by hand. Every read names a guard, and a value that does
// not pass it is dropped in favour of the fallback.

export type Guard<T> = (value: unknown) => value is T

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readSession<T>(key: string, fallback: T, guard: Guard<T>): T {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return fallback
    const parsed: unknown = JSON.parse(raw)
    return guard(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked. The app keeps working from memory.
  }
}

export function clearSession(prefix: string): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Nothing to clear.
  }
}
