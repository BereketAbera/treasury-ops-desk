export function newUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Older browsers on plain http: build a v4 UUID from getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** One per operator action. Every attempt of that action carries the same one. */
export function newCorrelationId(): string {
  return `cor_${newUuid().replace(/-/g, '').slice(0, 20)}`
}

/** One per intended payout or batch. Created when the form opens. */
export function newIdempotencyKey(): string {
  return newUuid()
}

export function shortId(id: string, keep = 8): string {
  return id.length <= keep + 1 ? id : `${id.slice(0, keep)}…`
}
