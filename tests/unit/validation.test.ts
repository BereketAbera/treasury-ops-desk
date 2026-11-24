import { describe, expect, it } from 'vitest'
import { findRoute, ROUTES } from '@/lib/routes'
import { validateAmount, validateDraft, type PayoutDraft } from '@/lib/validation'

const good: PayoutDraft = {
  reference: 'INV-20418',
  beneficiaryName: 'Adaeze Okonkwo Supplies',
  bank: 'Quayside Trust Bank',
  account: '0123456781',
  routeId: 'USDC-NGN',
  amount: '2,450,000.00',
  purposeCode: '',
}

describe('validateDraft', () => {
  it('accepts a complete draft and returns the amount in minor units', () => {
    const result = validateDraft(good)
    expect(result.errors).toEqual({})
    expect(result.targetMinor).toBe(245000000n)
    expect(result.purposeRequired).toBe(false)
  })

  it('reports every empty required field', () => {
    const result = validateDraft({ reference: '', beneficiaryName: '', bank: '', account: '', routeId: '', amount: '', purposeCode: '' })
    expect(Object.keys(result.errors).sort()).toEqual(['bank', 'beneficiaryName', 'reference', 'routeId'])
  })

  it('rejects a malformed reference', () => {
    expect(validateDraft({ ...good, reference: 'inv 1' }).errors.reference).toMatch(/capital letters/)
    expect(validateDraft({ ...good, reference: 'AB' }).errors.reference).toBeDefined()
  })

  it('checks the account format of the chosen route', () => {
    expect(validateDraft({ ...good, account: '12345' }).errors.account).toMatch(/10 digits/)
    expect(validateDraft({ ...good, routeId: 'USDC-XOF', amount: '1650000', account: '0123456781' }).errors.account).toMatch(/28 characters/)
    expect(validateDraft({ ...good, routeId: 'USDC-XOF', amount: '1650000', account: 'SN08SA0100152000048500003035' }).errors).toEqual({})
    expect(validateDraft({ ...good, routeId: 'USD-USDC', amount: '1000', account: '0x4b2f9C1d7E8a6035cD41f0A9b3E7526d18Fc90Ae' }).errors).toEqual({})
    expect(validateDraft({ ...good, routeId: 'USD-USDC', amount: '1000', account: '0x4b2f' }).errors.account).toMatch(/40 hexadecimal/)
  })

  it('enforces the decimal places of the target currency', () => {
    expect(validateDraft({ ...good, amount: '2450000.001' }).errors.amount).toBe('NGN takes at most 2 decimal places.')
    expect(validateDraft({ ...good, routeId: 'USDC-UGX', amount: '7450000.50' }).errors.amount).toBe('UGX has no minor unit. Enter a whole number.')
    expect(validateDraft({ ...good, routeId: 'USD-USDC', account: '0x4b2f9C1d7E8a6035cD41f0A9b3E7526d18Fc90Ae', amount: '1000.1234567' }).errors.amount).toBe(
      'USDC takes at most 6 decimal places.',
    )
  })

  it('enforces the limits of the route', () => {
    expect(validateDraft({ ...good, amount: '999.99' }).errors.amount).toBe('The minimum on this route is 1,000.00 NGN.')
    expect(validateDraft({ ...good, amount: '50,000,000.01', purposeCode: 'SUP' }).errors.amount).toBe('The maximum on this route is 50,000,000.00 NGN.')
    expect(validateDraft({ ...good, amount: '1000' }).errors.amount).toBeUndefined()
    expect(validateDraft({ ...good, amount: '50000000', purposeCode: 'SUP' }).errors.amount).toBeUndefined()
  })

  it('requires a purpose code at the threshold and above, not below', () => {
    expect(validateDraft({ ...good, amount: '4,999,999.99' }).errors.purposeCode).toBeUndefined()
    const atThreshold = validateDraft({ ...good, amount: '5,000,000.00' })
    expect(atThreshold.purposeRequired).toBe(true)
    expect(atThreshold.errors.purposeCode).toBe('A purpose code is required at 5,000,000.00 NGN or more.')
    expect(validateDraft({ ...good, amount: '5,000,000.00', purposeCode: 'SUP' }).errors).toEqual({})
  })

  it('rejects a purpose code that is not in the list', () => {
    expect(validateDraft({ ...good, purposeCode: 'XYZ' }).errors.purposeCode).toBe('Choose a purpose code from the list.')
  })
})

describe('routes', () => {
  it('has an example account that passes its own rule on every route', () => {
    for (const route of ROUTES) expect(route.account.pattern.test(route.account.example), route.id).toBe(true)
  })

  it('keeps the purpose threshold inside the limits', () => {
    for (const route of ROUTES) {
      expect(route.minMinor < route.purposeThresholdMinor, route.id).toBe(true)
      expect(route.purposeThresholdMinor <= route.maxMinor, route.id).toBe(true)
    }
  })

  it('validates an amount against a route on its own', () => {
    const route = findRoute('USDC-KES')!
    expect(validateAmount('186500.00', route)).toEqual({ minor: 18650000n })
    expect(validateAmount('', route).error).toBe('Enter an amount.')
  })
})
