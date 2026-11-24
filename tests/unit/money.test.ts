import { describe, expect, it } from 'vitest'
import { formatDecimal, formatMinor, isMinorString, parseAmount, problemMessage } from '@/ds/utils/money'
import { CURRENCIES, decimalsOf, feeFor, formatMoney, sourceForTarget } from '@/lib/currencies'

describe('decimal places per currency', () => {
  it('uses 2 places for NGN, KES, ZAR, GHS and USD', () => {
    for (const code of ['NGN', 'KES', 'ZAR', 'GHS', 'USD'] as const) expect(decimalsOf(code)).toBe(2)
  })

  it('uses 0 places for UGX, RWF and XOF', () => {
    for (const code of ['UGX', 'RWF', 'XOF'] as const) expect(decimalsOf(code)).toBe(0)
  })

  it('uses 6 places for USDC', () => {
    expect(CURRENCIES.USDC.decimals).toBe(6)
  })
})

describe('parseAmount', () => {
  it('parses a two-decimal amount into minor units', () => {
    expect(parseAmount('1250.50', 2)).toEqual({ ok: true, minor: 125050n })
  })

  it('pads missing decimal places', () => {
    expect(parseAmount('1250.5', 2)).toEqual({ ok: true, minor: 125050n })
    expect(parseAmount('1250', 2)).toEqual({ ok: true, minor: 125000n })
  })

  it('accepts commas and spaces as group separators', () => {
    expect(parseAmount('2,450,000.00', 2)).toEqual({ ok: true, minor: 245000000n })
    expect(parseAmount(' 2 450 000 ', 0)).toEqual({ ok: true, minor: 2450000n })
  })

  it('never reads a comma as a decimal separator', () => {
    // 1000,50 once became 100,050.00: a hundred times what was meant.
    expect(parseAmount('1000,50', 2)).toEqual({ ok: false, problem: 'misplaced_separator' })
    expect(parseAmount('1650000,50', 0)).toEqual({ ok: false, problem: 'misplaced_separator' })
    expect(parseAmount('1,5', 2)).toEqual({ ok: false, problem: 'misplaced_separator' })
    expect(parseAmount('12,50', 2)).toEqual({ ok: false, problem: 'misplaced_separator' })
  })

  it('accepts a comma only between groups of three digits, before the decimal point', () => {
    expect(parseAmount('1,000.50', 2)).toEqual({ ok: true, minor: 100050n })
    expect(parseAmount('1,650,000', 0)).toEqual({ ok: true, minor: 1650000n })
    expect(parseAmount('999', 0)).toEqual({ ok: true, minor: 999n })
    for (const text of ['1,00', '10,00,000', '1,0000', ',100', '100,', '1,,000', '1000,000', '1.000,50', '1,000.5,0', '1 000,50', '1,000 000']) {
      expect(parseAmount(text, 2), text).toEqual({ ok: false, problem: 'misplaced_separator' })
    }
  })

  it('reads a leading decimal point as zero units', () => {
    expect(parseAmount('.50', 2)).toEqual({ ok: true, minor: 50n })
    expect(parseAmount('.5', 6)).toEqual({ ok: true, minor: 500000n })
    expect(parseAmount('.50', 0)).toEqual({ ok: false, problem: 'too_many_decimals' })
    expect(parseAmount('.', 2)).toEqual({ ok: false, problem: 'not_a_number' })
    expect(parseAmount('5.', 2)).toEqual({ ok: true, minor: 500n })
  })

  it('rejects a third decimal place for a two-decimal currency, with no rounding', () => {
    expect(parseAmount('10.005', 2)).toEqual({ ok: false, problem: 'too_many_decimals' })
  })

  it('rejects any decimal digits for a zero-decimal currency', () => {
    expect(parseAmount('7450000.5', 0)).toEqual({ ok: false, problem: 'too_many_decimals' })
    expect(parseAmount('7450000', 0)).toEqual({ ok: true, minor: 7450000n })
  })

  it('accepts six places for USDC and rejects a seventh', () => {
    expect(parseAmount('1548.232172', 6)).toEqual({ ok: true, minor: 1548232172n })
    expect(parseAmount('0.0000001', 6)).toEqual({ ok: false, problem: 'too_many_decimals' })
  })

  it('keeps amounts a float cannot hold exactly', () => {
    expect(parseAmount('90071992547409.93', 2)).toEqual({ ok: true, minor: 9007199254740993n })
    expect(parseAmount('0.1', 6).ok && parseAmount('0.2', 6).ok).toBe(true)
  })

  it('reports empty and non-numeric input', () => {
    expect(parseAmount('', 2)).toEqual({ ok: false, problem: 'empty' })
    expect(parseAmount('   ', 2)).toEqual({ ok: false, problem: 'empty' })
    expect(parseAmount('12abc', 2)).toEqual({ ok: false, problem: 'not_a_number' })
    expect(parseAmount('-5', 2)).toEqual({ ok: false, problem: 'not_a_number' })
    expect(parseAmount('1e5', 2)).toEqual({ ok: false, problem: 'not_a_number' })
    expect(parseAmount('1.2.3', 2)).toEqual({ ok: false, problem: 'not_a_number' })
  })
})

describe('problemMessage', () => {
  it('tells the operator to use a point for decimals', () => {
    expect(problemMessage('misplaced_separator', 'NGN', 2)).toBe('Use a point for decimals, for example 1,000.50.')
    expect(problemMessage('misplaced_separator', 'UGX', 0)).toBe('Use commas only between groups of three digits, for example 1,000,000. UGX has no decimals.')
  })

  it('gives an example with the decimal places of the currency', () => {
    expect(problemMessage('not_a_number', 'NGN', 2)).toBe('Enter the amount as digits, for example 1250.50.')
    expect(problemMessage('not_a_number', 'UGX', 0)).toBe('Enter the amount as digits, for example 1250.')
    expect(problemMessage('not_a_number', 'USDC', 6)).toBe('Enter the amount as digits, for example 1250.50.')
  })
})

describe('formatDecimal, used for rates', () => {
  it('groups the whole part and fixes the number of decimal places', () => {
    expect(formatDecimal('3712.46', 2)).toBe('3,712.46')
    expect(formatDecimal('1582.4', 2)).toBe('1,582.40')
    expect(formatDecimal('18.274', 4)).toBe('18.2740')
    expect(formatDecimal('0.9992', 4)).toBe('0.9992')
    expect(formatDecimal('1438', 2)).toBe('1,438.00')
    expect(formatDecimal('1234567.5', 2)).toBe('1,234,567.50')
  })

  it('cuts extra places without rounding and leaves anything else alone', () => {
    expect(formatDecimal('603.259', 2)).toBe('603.25')
    expect(formatDecimal('12', 0)).toBe('12')
    expect(formatDecimal('n/a', 2)).toBe('n/a')
  })
})

describe('formatMinor', () => {
  it('formats with grouping and fixed decimal places', () => {
    expect(formatMinor(245000000n, 2)).toBe('2,450,000.00')
    expect(formatMinor('7450000', 0)).toBe('7,450,000')
    expect(formatMinor(1548232172n, 6)).toBe('1,548.232172')
  })

  it('pads amounts below one major unit', () => {
    expect(formatMinor(5n, 2)).toBe('0.05')
    expect(formatMinor(0n, 6)).toBe('0.000000')
    expect(formatMinor(0n, 0)).toBe('0')
  })

  it('can leave out group separators', () => {
    expect(formatMinor(245000000n, 2, { group: false })).toBe('2450000.00')
  })

  it('round-trips through parseAmount', () => {
    for (const [text, decimals] of [['2,450,000.00', 2], ['7,450,000', 0], ['1,548.232172', 6]] as const) {
      const parsed = parseAmount(text, decimals)
      expect(parsed.ok && formatMinor(parsed.minor, decimals)).toBe(text)
    }
  })

  it('puts the currency code after the number', () => {
    expect(formatMoney({ currency: 'NGN', amountMinor: '245000000' })).toBe('2,450,000.00 NGN')
  })
})

describe('isMinorString', () => {
  it('accepts only non-negative integer strings', () => {
    expect(isMinorString('245000000')).toBe(true)
    expect(isMinorString('2450000.00')).toBe(false)
    expect(isMinorString('-1')).toBe(false)
    expect(isMinorString(245000000)).toBe(false)
  })
})

describe('problemMessage', () => {
  it('names the currency rule that was broken', () => {
    expect(problemMessage('too_many_decimals', 'UGX', 0)).toBe('UGX has no minor unit. Enter a whole number.')
    expect(problemMessage('too_many_decimals', 'USDC', 6)).toBe('USDC takes at most 6 decimal places.')
  })
})

describe('conversion with integer arithmetic', () => {
  it('works out the USDC needed for an NGN amount, rounded up to the next minor unit', () => {
    // 2,450,000.00 NGN at 1582.45 NGN per USDC is 1548.2321716... USDC
    expect(sourceForTarget(245000000n, '1582.45', 'USDC', 'NGN')).toBe(1548232172n)
  })

  it('handles a zero-decimal target', () => {
    // 7,450,000 UGX at 3715 UGX per USDC is 2005.383580... USDC
    expect(sourceForTarget(7450000n, '3715.00', 'USDC', 'UGX')).toBe(2005383581n)
  })

  it('handles a six-decimal target and a two-decimal source', () => {
    // 1000 USDC at 0.9992 USDC per USD is 1000.8006... USD
    expect(sourceForTarget(1000000000n, '0.9992', 'USD', 'USDC')).toBe(100081n)
  })

  it('never returns less than the exact amount', () => {
    expect(sourceForTarget(1n, '3.00', 'USD', 'NGN')).toBe(1n)
  })

  it('charges a fee in basis points, rounded up', () => {
    expect(feeFor(1548232172n, 40)).toBe(6192929n)
    expect(feeFor(1n, 40)).toBe(1n)
    expect(feeFor(0n, 40)).toBe(0n)
  })
})
