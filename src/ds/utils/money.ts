// Money is an integer count of minor units, held as a bigint in code and as an
// integer string on the wire and in props. A float never touches an amount.

export type ParseProblem = 'empty' | 'not_a_number' | 'too_many_decimals'

export type ParseResult = { ok: true; minor: bigint } | { ok: false; problem: ParseProblem }

/**
 * Parses what an operator typed into minor units.
 * Commas and spaces are accepted as group separators. Extra decimal places are
 * an error, never rounded away.
 */
export function parseAmount(input: string, decimals: number): ParseResult {
  const cleaned = input.replace(/[,\s]/g, '')
  if (cleaned === '') return { ok: false, problem: 'empty' }
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned)
  if (!match) return { ok: false, problem: 'not_a_number' }
  const whole = match[1] ?? '0'
  const fraction = match[2] ?? ''
  if (fraction.length > decimals) return { ok: false, problem: 'too_many_decimals' }
  const minor = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  return { ok: true, minor }
}

/** Formats minor units as a plain decimal number, for example 125000050n with 2 places gives "1,250,000.50". */
export function formatMinor(minor: bigint | string, decimals: number, options: { group?: boolean } = {}): string {
  const value = typeof minor === 'string' ? BigInt(minor) : minor
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals)
  const fraction = decimals === 0 ? '' : digits.slice(-decimals)
  const grouped = options.group === false ? whole : whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}

/** True when the string is a non-negative integer, the wire format for amounts. */
export function isMinorString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}

export function problemMessage(problem: ParseProblem, currency: string, decimals: number): string {
  switch (problem) {
    case 'empty':
      return 'Enter an amount.'
    case 'not_a_number':
      return 'Enter the amount as digits, for example 1250.50.'
    case 'too_many_decimals':
      return decimals === 0
        ? `${currency} has no minor unit. Enter a whole number.`
        : `${currency} takes at most ${decimals} decimal places.`
  }
}
