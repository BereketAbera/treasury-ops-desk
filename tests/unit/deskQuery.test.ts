import { describe, expect, it } from 'vitest'
import { DEFAULT_SORT, parseDeskQuery, parseSort } from '@/lib/deskQuery'

describe('instruction table query parameters', () => {
  it('reads a valid view', () => {
    expect(parseDeskQuery({ q: 'gulu', status: 'completed', route: 'USDC-XOF', currency: 'XOF', selected: 'PO-48260', sort: 'target:asc' })).toEqual({
      q: 'gulu',
      status: 'completed',
      route: 'USDC-XOF',
      currency: 'XOF',
      selected: 'PO-48260',
      sort: { key: 'target', direction: 'asc' },
    })
  })

  it('falls back to the default sort for a key that is not a column, including prototype property names', () => {
    for (const value of ['__proto__:asc', 'hasOwnProperty', 'constructor:desc', 'toString:asc', 'valueOf', 'nope:asc', ':asc', '', 'created:asc:extra']) {
      expect(parseSort(value), value).toEqual(DEFAULT_SORT)
    }
  })

  it('accepts only asc and desc as a direction', () => {
    expect(parseSort('status:asc')).toEqual({ key: 'status', direction: 'asc' })
    expect(parseSort('status:sideways')).toEqual({ key: 'status', direction: 'desc' })
    expect(parseSort('status')).toEqual({ key: 'status', direction: 'desc' })
  })

  it('drops filter values that are not in the allowed lists', () => {
    const view = parseDeskQuery({
      status: '__proto__',
      route: 'USDC-EUR',
      currency: 'constructor',
      selected: '<img src=x onerror=alert(1)>',
      sort: ['id:asc', 'created:desc'],
      q: ['a', 'b'],
    })
    expect(view).toEqual({ q: '', status: '', route: '', currency: '', selected: null, sort: DEFAULT_SORT })
  })

  it('ignores missing, repeated and non-string parameters', () => {
    expect(parseDeskQuery({})).toEqual({ q: '', status: '', route: '', currency: '', selected: null, sort: DEFAULT_SORT })
    expect(parseDeskQuery({ status: null, route: undefined, selected: 48260 }).selected).toBeNull()
  })

  it('accepts only a payout ID as the selected row and caps the search text', () => {
    expect(parseDeskQuery({ selected: 'PO-99999' }).selected).toBe('PO-99999')
    expect(parseDeskQuery({ selected: 'PO-1; drop' }).selected).toBeNull()
    expect(parseDeskQuery({ q: 'x'.repeat(500) }).q).toHaveLength(80)
  })
})
