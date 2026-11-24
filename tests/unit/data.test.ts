import { describe, expect, it } from 'vitest'
import { isMinorString } from '@/ds/utils/money'
import { parseBatchCsv, splitCsvLine } from '@/lib/batchCsv'
import { findRoute } from '@/lib/routes'
import { countBatch } from '@/lib/types'
import { buildSeed } from '@/mocks/seed'

const HEADER = 'reference,beneficiary,bank,account,route,amount,purpose'

describe('seed data', () => {
  const seed = buildSeed(Date.parse('2026-11-24T12:00:00.000Z'))

  it('has 60 instructions with unique IDs and references', () => {
    expect(seed).toHaveLength(60)
    expect(new Set(seed.map((payout) => payout.id)).size).toBe(60)
    expect(new Set(seed.map((payout) => payout.reference)).size).toBe(60)
  })

  it('is the same on every build', () => {
    expect(buildSeed(Date.parse('2026-11-24T12:00:00.000Z'))).toEqual(seed)
  })

  it('holds every amount as an integer string inside the limits of its route', () => {
    for (const payout of seed) {
      const route = findRoute(payout.routeId)!
      expect(isMinorString(payout.source.amountMinor), payout.id).toBe(true)
      expect(isMinorString(payout.target.amountMinor), payout.id).toBe(true)
      expect(isMinorString(payout.fee.amountMinor), payout.id).toBe(true)
      const target = BigInt(payout.target.amountMinor)
      expect(target >= route.minMinor && target <= route.maxMinor, payout.id).toBe(true)
      expect(route.account.pattern.test(payout.beneficiary.account), payout.id).toBe(true)
    }
  })

  it('covers every status, with a reason on each unsuccessful one', () => {
    const statuses = new Set(seed.map((payout) => payout.status))
    expect(statuses.size).toBe(10)
    for (const payout of seed.filter((item) => ['failed', 'rejected', 'returned'].includes(item.status))) {
      expect(payout.failure?.code, payout.id).toBeTruthy()
      expect(payout.failure?.nextStep, payout.id).toBeTruthy()
    }
  })
})

describe('batch CSV', () => {
  it('splits quoted cells that contain commas', () => {
    expect(splitCsvLine('BAT-1,"Osei, Mensah and Sons",Bank')).toEqual(['BAT-1', 'Osei, Mensah and Sons', 'Bank'])
    expect(splitCsvLine('a,"say ""hi""",c')).toEqual(['a', 'say "hi"', 'c'])
  })

  it('turns valid lines into items with minor-unit amounts and one key each', () => {
    let next = 0
    const parsed = parseBatchCsv(
      [HEADER, 'BAT-1001,Adaeze Okonkwo Supplies,Harbour Trust Bank,0123456781,USDC-NGN,2450000.00,', 'BAT-1005,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000,'].join('\n'),
      () => `key-${(next += 1)}`,
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows.map((row) => row.item?.targetAmountMinor)).toEqual(['245000000', '7450000'])
    expect(parsed.rows.map((row) => row.item?.itemKey)).toEqual(['key-1', 'key-2'])
  })

  it('reports problems per line and builds no item for them', () => {
    const parsed = parseBatchCsv(
      [HEADER, 'BAT-1,Nile Basin Traders,Lakeshore Commercial Bank,3100456789,USDC-UGX,7450000.50,', 'BAT-1,Kivu Agro Exports,Thousand Hills Bank,12,USDC-RWF,2380000,'].join('\n'),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.rows[0]?.problems).toEqual(['UGX has no minor unit. Enter a whole number.'])
    expect(parsed.rows[0]?.item).toBeNull()
    expect(parsed.rows[1]?.problems).toHaveLength(2)
    expect(parsed.rows[1]?.problems).toContain('This reference appears earlier in the file.')
  })

  it('rejects a file with no header, no lines, or too many lines', () => {
    expect(parseBatchCsv('')).toMatchObject({ ok: false })
    expect(parseBatchCsv('a,b,c\n1,2,3')).toMatchObject({ ok: false, problem: expect.stringContaining('Missing') })
    expect(parseBatchCsv(HEADER)).toMatchObject({ ok: false })
    const many = [HEADER, ...Array.from({ length: 1001 }, (_, index) => `BAT-${index},A,B,0123456781,USDC-NGN,1000,`)].join('\n')
    expect(parseBatchCsv(many)).toMatchObject({ ok: false, problem: 'A batch holds at most 1000 instructions.' })
  })

  it('counts a batch by item status', () => {
    const item = (status: 'booked' | 'rejected' | 'outcome_unknown') => ({ status }) as never
    const items = [...Array(9).fill(item('booked')), item('rejected'), item('rejected'), item('outcome_unknown')]
    expect(countBatch({ items })).toEqual({ total: 12, booked: 9, rejected: 2, unknown: 1 })
  })
})
