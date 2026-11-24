import { formatMinor, parseAmount, problemMessage } from '@/ds/utils/money'
import { decimalsOf } from './currencies'
import { findRoute, isPurposeCode, type PayoutRoute } from './routes'

export interface PayoutDraft {
  reference: string
  beneficiaryName: string
  bank: string
  account: string
  routeId: string
  /** What the operator typed, in the target currency. */
  amount: string
  purposeCode: string
}

export type DraftField = keyof PayoutDraft
export type FieldErrors = Partial<Record<DraftField, string>>

export interface DraftValidation {
  errors: FieldErrors
  route?: PayoutRoute
  targetMinor?: bigint
  purposeRequired: boolean
}

export const FIELD_ORDER: DraftField[] = [
  'reference',
  'beneficiaryName',
  'bank',
  'routeId',
  'account',
  'amount',
  'purposeCode',
]

export const REFERENCE_PATTERN = /^[A-Z0-9][A-Z0-9-]{3,19}$/
export const NAME_LENGTH = { min: 2, max: 70 }
export const NAME_LENGTH_PROBLEM = `The name must be ${NAME_LENGTH.min} to ${NAME_LENGTH.max} characters.`

export function nameLengthOk(name: string): boolean {
  return name.length >= NAME_LENGTH.min && name.length <= NAME_LENGTH.max
}

export function emptyDraft(): PayoutDraft {
  return { reference: '', beneficiaryName: '', bank: '', account: '', routeId: '', amount: '', purposeCode: '' }
}

export function validateAmount(amount: string, route: PayoutRoute): { error?: string; minor?: bigint } {
  const decimals = decimalsOf(route.target)
  const parsed = parseAmount(amount, decimals)
  if (!parsed.ok) return { error: problemMessage(parsed.problem, route.target, decimals) }
  if (parsed.minor < route.minMinor) {
    return { error: `The minimum on this route is ${formatMinor(route.minMinor, decimals)} ${route.target}.` }
  }
  if (parsed.minor > route.maxMinor) {
    return { error: `The maximum on this route is ${formatMinor(route.maxMinor, decimals)} ${route.target}.` }
  }
  return { minor: parsed.minor }
}

export function validateDraft(draft: PayoutDraft): DraftValidation {
  const errors: FieldErrors = {}
  const route = findRoute(draft.routeId)
  let targetMinor: bigint | undefined

  const reference = draft.reference.trim()
  if (reference === '') errors.reference = 'Enter your reference for this payout.'
  else if (!REFERENCE_PATTERN.test(reference)) {
    errors.reference = 'Use 4 to 20 capital letters, digits or hyphens, for example INV-20418.'
  }

  const name = draft.beneficiaryName.trim()
  if (name === '') errors.beneficiaryName = 'Enter the beneficiary name.'
  else if (!nameLengthOk(name)) errors.beneficiaryName = NAME_LENGTH_PROBLEM

  if (draft.bank.trim() === '') errors.bank = 'Enter the beneficiary bank or wallet provider.'

  if (!route) {
    errors.routeId = 'Choose a route.'
  } else {
    const account = draft.account.trim()
    if (account === '') errors.account = `Enter the ${route.account.label.toLowerCase()}.`
    else if (!route.account.pattern.test(account)) {
      errors.account = `This is not a valid ${route.account.label.toLowerCase()} for ${route.target}. ${route.account.hint}`
    }

    const amount = validateAmount(draft.amount, route)
    if (amount.error) errors.amount = amount.error
    targetMinor = amount.minor
  }

  const purposeRequired = Boolean(route && targetMinor !== undefined && targetMinor >= route.purposeThresholdMinor)
  if (draft.purposeCode !== '' && !isPurposeCode(draft.purposeCode)) {
    errors.purposeCode = 'Choose a purpose code from the list.'
  } else if (purposeRequired && draft.purposeCode === '' && route) {
    const threshold = formatMinor(route.purposeThresholdMinor, decimalsOf(route.target))
    errors.purposeCode = `A purpose code is required at ${threshold} ${route.target} or more.`
  }

  return { errors, route, targetMinor, purposeRequired }
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0
}
