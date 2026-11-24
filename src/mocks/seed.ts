import { decimalsOf, feeFor, sourceForTarget } from '@/lib/currencies'
import { ROUTES, type PayoutRoute } from '@/lib/routes'
import type { Failure, Payout, PayoutStatus, TimelineEvent } from '@/lib/types'

// Everything here is invented: companies, banks, accounts, amounts and rates.

const BENEFICIARIES = [
  'Adaeze Okonkwo Supplies',
  'Lakeview Freight Ltd',
  'Protea Packaging',
  'Volta Cold Chain',
  'Nile Basin Traders',
  'Kivu Agro Exports',
  'Teranga Textiles',
  'Osei and Mensah Logistics',
  'Zuri Print Works',
  'Ibadan Steel Fabricators',
  'Baobab Solar Installers',
  'Highveld Seed Company',
  'Marula Foods',
  'Kano Grain Merchants',
  'Mombasa Dry Dock Services',
  'Acacia Office Supply',
  'Limpopo Water Works',
  'Tamale Shea Collective',
  'Jinja Roofing Sheets',
  'Musanze Coffee Washers',
  'Dakar Fish Market Coop',
  'Abidjan Cocoa Haulage',
  'Enugu Medical Stores',
  'Nakuru Dairy Hauliers',
  'Durban Container Repairs',
  'Kumasi Timber Yard',
  'Gulu Maize Millers',
  'Rubavu Lake Transport',
  'Thies Solar Pumps',
  'Meridian Custody Desk',
]

const BANKS: Record<string, string[]> = {
  NGN: ['Harbour Trust Bank', 'Delta Crescent Bank'],
  KES: ['Savanna Union Bank', 'Ridgeline Cooperative Bank'],
  ZAR: ['Cape Meridian Bank', 'Highveld Mutual'],
  GHS: ['Gold Coast Mutual', 'Volta Savings Bank'],
  UGX: ['Lakeshore Commercial Bank'],
  RWF: ['Thousand Hills Bank'],
  XOF: ['Sahel Atlantic Bank'],
  USDC: ['Self-custody wallet', 'Custody provider wallet'],
}

const FAILURES: Record<string, Failure> = {
  beneficiary_bank_unavailable: {
    code: 'beneficiary_bank_unavailable',
    message: 'The beneficiary bank did not accept the payment in time.',
    retryable: true,
    nextStep: 'No funds left the source balance. Retry the payout.',
  },
  insufficient_funding: {
    code: 'insufficient_funding',
    message: 'The source balance was too low when the payout was released.',
    retryable: true,
    nextStep: 'Fund the source balance, then retry the payout.',
  },
  account_closed: {
    code: 'account_closed',
    message: 'The beneficiary bank reports that this account is closed.',
    retryable: false,
    nextStep: 'Confirm the account with the beneficiary and create a new payout.',
  },
  screening_rejected: {
    code: 'screening_rejected',
    message: 'The instruction was rejected in screening review.',
    retryable: false,
    nextStep: 'Do not resend. Pass the correlation ID to the compliance desk.',
  },
  approver_rejected: {
    code: 'approver_rejected',
    message: 'An approver rejected this instruction.',
    retryable: false,
    nextStep: 'Read the approver note, then create a corrected payout if needed.',
  },
  returned_name_mismatch: {
    code: 'returned_name_mismatch',
    message: 'The beneficiary bank returned the funds: the name does not match the account.',
    retryable: false,
    nextStep: 'The funds are back in the source balance. Correct the name and create a new payout.',
  },
}

const STATUS_PLAN: [PayoutStatus, number, (string | null)[]][] = [
  ['completed', 25, [null]],
  ['sent', 8, [null]],
  ['processing', 6, [null]],
  ['awaiting_approval', 6, [null]],
  ['failed', 5, ['beneficiary_bank_unavailable', 'insufficient_funding', 'account_closed']],
  ['rejected', 2, ['screening_rejected', 'approver_rejected']],
  ['returned', 2, ['returned_name_mismatch']],
  ['cancelled', 2, [null]],
  ['draft', 2, [null]],
  ['outcome_unknown', 2, [null]],
]

const PATHS: Record<PayoutStatus, PayoutStatus[]> = {
  draft: ['draft'],
  awaiting_approval: ['draft', 'awaiting_approval'],
  processing: ['draft', 'awaiting_approval', 'processing'],
  sent: ['draft', 'awaiting_approval', 'processing', 'sent'],
  completed: ['draft', 'awaiting_approval', 'processing', 'sent', 'completed'],
  failed: ['draft', 'awaiting_approval', 'processing', 'failed'],
  rejected: ['draft', 'awaiting_approval', 'rejected'],
  returned: ['draft', 'awaiting_approval', 'processing', 'sent', 'returned'],
  cancelled: ['draft', 'awaiting_approval', 'cancelled'],
  outcome_unknown: ['draft', 'awaiting_approval', 'processing', 'outcome_unknown'],
}

/** Small seeded random number source, so the seed data is the same on every visit. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hex(random: () => number, length: number): string {
  let out = ''
  while (out.length < length) out += Math.floor(random() * 16).toString(16)
  return out
}

function uuidFrom(random: () => number): string {
  const h = hex(random, 32)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`
}

function digitsFrom(random: () => number, length: number): string {
  let out = ''
  while (out.length < length) out += Math.floor(random() * 10).toString()
  return out
}

export function exampleAccount(route: PayoutRoute, random: () => number): string {
  if (route.target === 'USDC') return `0x${hex(random, 40)}`
  if (route.target === 'XOF') return `${random() < 0.5 ? 'SN' : 'CI'}${digitsFrom(random, 2)}SA${digitsFrom(random, 22)}`
  // Never ends in 0000: the mock API uses that ending for its "account not found" answer.
  return `${digitsFrom(random, route.account.example.length - 1)}${1 + Math.floor(random() * 9)}`
}

function amountFor(route: PayoutRoute, random: () => number): bigint {
  const decimals = decimalsOf(route.target)
  const unit = 10n ** BigInt(decimals)
  const min = Number(route.minMinor / unit) * 4
  const max = Number(route.maxMinor / unit) / 6
  const major = Math.round((min + random() ** 2 * (max - min)) / 50) * 50 + 50
  const cents = decimals === 2 && random() < 0.35 ? BigInt(Math.floor(random() * 100)) : 0n
  return BigInt(major) * unit + cents
}

function nudgeRate(rate: string, random: () => number): string {
  const places = (rate.split('.')[1] ?? '').length
  const scaled = Math.round(Number(rate) * 10 ** places * (0.996 + random() * 0.008))
  return (scaled / 10 ** places).toFixed(places)
}

export function externalReferenceFor(route: PayoutRoute, random: () => number): string {
  return route.target === 'USDC' ? `0x${hex(random, 64)}` : `TRC${digitsFrom(random, 12)}`
}

const MINUTE = 60_000

export function buildSeed(now: number): Payout[] {
  const random = mulberry32(20261124)
  const statuses: { status: PayoutStatus; failure: string | null }[] = []
  for (const [status, count, failures] of STATUS_PLAN) {
    for (let i = 0; i < count; i += 1) statuses.push({ status, failure: failures[i % failures.length] ?? null })
  }
  // Spread the statuses through time instead of grouping them.
  for (let i = statuses.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = statuses[i]
    const b = statuses[j]
    if (a && b) {
      statuses[i] = b
      statuses[j] = a
    }
  }

  return statuses.map((entry, index) => {
    const route = ROUTES[Math.floor(random() * 100) % ROUTES.length] ?? ROUTES[0]!
    const target = amountFor(route, random)
    const rate = nudgeRate(route.rate, random)
    const source = sourceForTarget(target, rate, route.source, route.target)
    const fee = feeFor(source, route.feeBasisPoints)
    const created = now - (index * 43 + 6 + Math.floor(random() * 30)) * MINUTE
    const path = PATHS[entry.status]
    const timeline: TimelineEvent[] = path.map((status, step) => ({
      status,
      at: new Date(created + step * (2 + Math.floor(random() * 6)) * MINUTE).toISOString(),
    }))
    const last = timeline[timeline.length - 1]
    const failure = entry.failure ? (FAILURES[entry.failure] ?? null) : null
    if (last && failure) last.note = failure.message
    if (last && entry.status === 'outcome_unknown') last.note = 'The rail did not confirm the payment.'
    const banks = BANKS[route.target] ?? ['Harbour Trust Bank']
    const wasSent = path.includes('sent')
    const number = 48260 - index

    return {
      id: `PO-${number}`,
      reference: `INV-${24900 - index * 37 - Math.floor(random() * 30)}`,
      createdAt: new Date(created).toISOString(),
      updatedAt: last ? last.at : new Date(created).toISOString(),
      beneficiary: {
        name: BENEFICIARIES[Math.floor(random() * BENEFICIARIES.length)] ?? 'Marula Foods',
        bank: banks[Math.floor(random() * banks.length)] ?? 'Harbour Trust Bank',
        account: exampleAccount(route, random),
      },
      routeId: route.id,
      source: { currency: route.source, amountMinor: source.toString() },
      target: { currency: route.target, amountMinor: target.toString() },
      rate,
      fee: { currency: route.source, amountMinor: fee.toString() },
      status: entry.status,
      purposeCode: target >= route.purposeThresholdMinor ? 'SUP' : null,
      failure,
      externalReference: wasSent ? externalReferenceFor(route, random) : null,
      idempotencyKey: uuidFrom(random),
      correlationId: `cor_${hex(random, 20)}`,
      timeline,
    } satisfies Payout
  })
}
