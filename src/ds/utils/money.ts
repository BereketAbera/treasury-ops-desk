// Money is an integer count of minor units, held as a bigint in code and as an
// integer string on the wire and in props. A float never touches an amount.

export type ParseProblem = 'empty' | 'not_a_number' | 'misplaced_separator' | 'too_many_decimals'

export type ParseResult = { ok: true; minor: bigint } | { ok: false; problem: ParseProblem }

const PLAIN = /^\d+$/
const GROUPED_BY_COMMA = /^\d{1,3}(?:,\d{3})+$/
const GROUPED_BY_SPACE = /^\d{1,3}(?: \d{3})+$/

/**
 * Parses what an operator typed into minor units. Nothing is guessed:
 *
 * - The decimal separator is a point. A comma is never read as one.
 * - A comma (or a space) is accepted only as a thousands separator in a valid
 *   position: groups of three, before any decimal point. "1,000.50" is an
 *   amount; "1000,50" and "1,00" are problems, not 100,050 and 100.
 * - Extra decimal places are a problem, never rounded away.
 * - ".50" is read as 0.50.
 */
export function parseAmount(input: string, decimals: number): ParseResult {
  const text = input.trim()
  if (text === '') return { ok: false, problem: 'empty' }
  if (!/^[\d., ]+$/.test(text)) return { ok: false, problem: 'not_a_number' }

  const pointAt = text.indexOf('.')
  if (pointAt !== text.lastIndexOf('.')) return { ok: false, problem: 'not_a_number' }
  const wholeText = pointAt === -1 ? text : text.slice(0, pointAt)
  const fraction = pointAt === -1 ? '' : text.slice(pointAt + 1)
  if (/[, ]/.test(fraction)) return { ok: false, problem: 'misplaced_separator' }
  if (wholeText === '' && fraction === '') return { ok: false, problem: 'not_a_number' }

  let whole = wholeText
  if (wholeText !== '' && !PLAIN.test(wholeText)) {
    if (!GROUPED_BY_COMMA.test(wholeText) && !GROUPED_BY_SPACE.test(wholeText)) return { ok: false, problem: 'misplaced_separator' }
    whole = wholeText.replace(/[, ]/g, '')
  }
  if (fraction.length > decimals) return { ok: false, problem: 'too_many_decimals' }
  const minor = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0')
  return { ok: true, minor }
}

/** Formats minor units as a plain decimal number, for example 125000050n with 2 places gives "1,250,000.50". */
export function formatMinor(minor: bigint | string, decimals: number, options: { group?: boolean } = {}): string {
  const value = typeof minor === 'string' ? BigInt(minor) : minor
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = decimals === 0 ? digits : digits.slice(0, -decimals)
  const fraction = decimals === 0 ? '' : digits.slice(-decimals)
  const grouped = options.group === false ? whole : groupThousands(whole)
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}

export function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Formats a decimal string such as a rate with grouping and a fixed number of
 * decimal places: "3712.46" with 2 places gives "3,712.46", "18.274" with 4
 * gives "18.2740". Extra places are cut, never rounded. Anything that is not a
 * plain decimal number is returned unchanged.
 */
export function formatDecimal(value: string, places: number): string {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value)
  if (!match) return value
  const fraction = (match[2] ?? '').padEnd(places, '0').slice(0, places)
  return `${groupThousands(match[1] ?? '0')}${places > 0 ? `.${fraction}` : ''}`
}

/** True when the string is a non-negative integer, the wire format for amounts. */
export function isMinorString(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value)
}

/** An example amount with the currency's own number of decimal places. */
function example(decimals: number, grouped: boolean): string {
  const whole = grouped ? '1,000' : '1250'
  return decimals === 0 ? whole : `${whole}.50`
}

export function problemMessage(problem: ParseProblem, currency: string, decimals: number): string {
  switch (problem) {
    case 'empty':
      return 'Enter an amount.'
    case 'not_a_number':
      return `Enter the amount as digits, for example ${example(decimals, false)}.`
    case 'misplaced_separator':
      return decimals === 0
        ? `Use commas only between groups of three digits, for example 1,000,000. ${currency} has no decimals.`
        : `Use a point for decimals, for example ${example(decimals, true)}.`
    case 'too_many_decimals':
      return decimals === 0
        ? `${currency} has no minor unit. Enter a whole number.`
        : `${currency} takes at most ${decimals} decimal places.`
  }
}
