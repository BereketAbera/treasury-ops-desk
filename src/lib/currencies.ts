import { formatMinor } from '@/ds/utils/money'

export type CurrencyCode = 'NGN' | 'KES' | 'ZAR' | 'GHS' | 'USD' | 'UGX' | 'RWF' | 'XOF' | 'USDC'

export interface Currency {
  code: CurrencyCode
  name: string
  /** Decimal places of the minor unit: ISO 4217 for fiat, 6 for USDC. */
  decimals: number
}

export const CURRENCIES: Record<CurrencyCode, Currency> = {
  NGN: { code: 'NGN', name: 'Nigerian naira', decimals: 2 },
  KES: { code: 'KES', name: 'Kenyan shilling', decimals: 2 },
  ZAR: { code: 'ZAR', name: 'South African rand', decimals: 2 },
  GHS: { code: 'GHS', name: 'Ghanaian cedi', decimals: 2 },
  USD: { code: 'USD', name: 'US dollar', decimals: 2 },
  UGX: { code: 'UGX', name: 'Ugandan shilling', decimals: 0 },
  RWF: { code: 'RWF', name: 'Rwandan franc', decimals: 0 },
  XOF: { code: 'XOF', name: 'West African CFA franc', decimals: 0 },
  USDC: { code: 'USDC', name: 'USD Coin', decimals: 6 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[]

export function decimalsOf(code: CurrencyCode): number {
  return CURRENCIES[code].decimals
}

export interface Money {
  currency: CurrencyCode
  /** Integer string of minor units. */
  amountMinor: string
}

export function formatMoney(money: Money): string {
  return `${formatMinor(money.amountMinor, decimalsOf(money.currency))} ${money.currency}`
}

const RATE_SCALE = 8

function parseRate(rate: string): bigint {
  const [whole = '0', fraction = ''] = rate.split('.')
  return BigInt(whole) * 10n ** BigInt(RATE_SCALE) + BigInt(fraction.padEnd(RATE_SCALE, '0').slice(0, RATE_SCALE))
}

function divideRoundUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

/**
 * Source amount needed to deliver a target amount at a rate.
 * The rate is a decimal string: units of target currency per one unit of source.
 * Integer arithmetic only, rounded up to the next source minor unit.
 */
export function sourceForTarget(
  targetMinor: bigint,
  rate: string,
  source: CurrencyCode,
  target: CurrencyCode,
): bigint {
  const scaledRate = parseRate(rate)
  if (scaledRate === 0n) throw new Error('Rate must be greater than zero')
  const numerator = targetMinor * 10n ** BigInt(decimalsOf(source)) * 10n ** BigInt(RATE_SCALE)
  const denominator = scaledRate * 10n ** BigInt(decimalsOf(target))
  return divideRoundUp(numerator, denominator)
}

/** Fee in basis points of an amount, rounded up to the next minor unit. */
export function feeFor(amountMinor: bigint, basisPoints: number): bigint {
  return divideRoundUp(amountMinor * BigInt(basisPoints), 10_000n)
}
