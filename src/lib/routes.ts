import type { CurrencyCode } from './currencies'

// The limits, thresholds, account formats and rates below are made up for this
// sample. They show the kind of rule the form enforces, not any real scheme.

export interface AccountRule {
  label: string
  pattern: RegExp
  hint: string
  example: string
}

export interface PayoutRoute {
  id: string
  source: CurrencyCode
  target: CurrencyCode
  /** Units of target per one unit of source, as a decimal string. */
  rate: string
  feeBasisPoints: number
  /** Limits and threshold are in target minor units. */
  minMinor: bigint
  maxMinor: bigint
  purposeThresholdMinor: bigint
  account: AccountRule
}

const digits = (min: number, max: number, example: string): AccountRule => ({
  label: 'Account number',
  pattern: new RegExp(`^\\d{${min}${max === min ? '' : `,${max}`}}$`),
  hint: min === max ? `${min} digits.` : `${min} to ${max} digits.`,
  example,
})

export const ROUTES: PayoutRoute[] = [
  {
    id: 'USDC-NGN',
    source: 'USDC',
    target: 'NGN',
    rate: '1582.45',
    feeBasisPoints: 40,
    minMinor: 100_000n,
    maxMinor: 5_000_000_000n,
    purposeThresholdMinor: 500_000_000n,
    account: digits(10, 10, '0123456781'),
  },
  {
    id: 'USDC-KES',
    source: 'USDC',
    target: 'KES',
    rate: '129.30',
    feeBasisPoints: 45,
    minMinor: 10_000n,
    maxMinor: 400_000_000n,
    purposeThresholdMinor: 100_000_000n,
    account: digits(10, 13, '20045678901'),
  },
  {
    id: 'USDC-ZAR',
    source: 'USDC',
    target: 'ZAR',
    rate: '18.2740',
    feeBasisPoints: 35,
    minMinor: 5_000n,
    maxMinor: 150_000_000n,
    purposeThresholdMinor: 10_000_000n,
    account: digits(9, 11, '620044170'),
  },
  {
    id: 'USDC-GHS',
    source: 'USDC',
    target: 'GHS',
    rate: '15.6200',
    feeBasisPoints: 50,
    minMinor: 5_000n,
    maxMinor: 80_000_000n,
    purposeThresholdMinor: 15_000_000n,
    account: digits(13, 13, '1400023456789'),
  },
  {
    id: 'USDC-UGX',
    source: 'USDC',
    target: 'UGX',
    rate: '3715.00',
    feeBasisPoints: 55,
    minMinor: 5_000n,
    maxMinor: 900_000_000n,
    purposeThresholdMinor: 50_000_000n,
    account: digits(10, 13, '3100456789'),
  },
  {
    id: 'USDC-RWF',
    source: 'USDC',
    target: 'RWF',
    rate: '1438.50',
    feeBasisPoints: 55,
    minMinor: 2_000n,
    maxMinor: 300_000_000n,
    purposeThresholdMinor: 20_000_000n,
    account: digits(10, 16, '4002115678'),
  },
  {
    id: 'USDC-XOF',
    source: 'USDC',
    target: 'XOF',
    rate: '603.25',
    feeBasisPoints: 50,
    minMinor: 1_000n,
    maxMinor: 150_000_000n,
    purposeThresholdMinor: 10_000_000n,
    account: {
      label: 'IBAN',
      pattern: /^[A-Z]{2}\d{2}[A-Z0-9]{24}$/,
      hint: '28 characters: two letters, two digits, then 24 letters or digits. No spaces.',
      example: 'SN08SA0100152000048500003035',
    },
  },
  {
    id: 'USD-USDC',
    source: 'USD',
    target: 'USDC',
    rate: '0.9992',
    feeBasisPoints: 20,
    minMinor: 10_000_000n,
    maxMinor: 250_000_000_000n,
    purposeThresholdMinor: 50_000_000_000n,
    account: {
      label: 'Wallet address',
      pattern: /^0x[0-9a-fA-F]{40}$/,
      hint: '0x followed by 40 hexadecimal characters.',
      example: '0x4b2f9C1d7E8a6035cD41f0A9b3E7526d18Fc90Ae',
    },
  },
]

export const ROUTE_IDS = ROUTES.map((route) => route.id)

export function findRoute(id: string): PayoutRoute | undefined {
  return ROUTES.find((route) => route.id === id)
}

/** "USDC to NGN" */
export function routeLabel(route: Pick<PayoutRoute, 'source' | 'target'>): string {
  return `${route.source} to ${route.target}`
}

export const PURPOSE_CODES = [
  { value: 'SUP', label: 'SUP · Supplier payment' },
  { value: 'SAL', label: 'SAL · Payroll' },
  { value: 'SVC', label: 'SVC · Services' },
  { value: 'TRS', label: 'TRS · Treasury transfer' },
  { value: 'RFD', label: 'RFD · Refund' },
] as const

export function isPurposeCode(value: string): boolean {
  return PURPOSE_CODES.some((code) => code.value === value)
}
