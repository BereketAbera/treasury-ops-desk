// Session storage only: state lasts for the tab and nothing is written to localStorage.

export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
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
