import type { TableSort } from '@/ds'
import { ROUTE_IDS, ROUTES } from './routes'
import { PAYOUT_STATUSES, type PayoutStatus } from './types'

// The instruction table keeps its view in the URL. A URL is input from outside,
// so every parameter is checked against a list of allowed values and anything
// else falls back to the default. Nothing from the URL is used as an object key.

export const SORT_KEYS = ['id', 'created', 'beneficiary', 'route', 'source', 'target', 'rate', 'status', 'updated'] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const DEFAULT_SORT: TableSort = { key: 'created', direction: 'desc' }
export const TARGET_CURRENCIES = [...new Set(ROUTES.map((route) => route.target))]

const PAYOUT_ID = /^PO-\d{1,9}$/
const SEARCH_LIMIT = 80

export interface DeskQuery {
  q: string
  status: PayoutStatus | ''
  route: string
  currency: string
  selected: string | null
  sort: TableSort
}

function text(value: unknown): string {
  // vue-router gives an array when a parameter is repeated. Only a single string is accepted.
  return typeof value === 'string' ? value : ''
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | '' {
  const candidate = text(value)
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : ''
}

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value)
}

export function parseSort(value: unknown): TableSort {
  const [key, direction, ...rest] = text(value).split(':')
  if (rest.length > 0 || !isSortKey(key)) return { ...DEFAULT_SORT }
  if (direction !== 'asc' && direction !== 'desc') return { key, direction: 'desc' }
  return { key, direction }
}

export function parseDeskQuery(query: Record<string, unknown>): DeskQuery {
  const selected = text(query.selected)
  return {
    q: text(query.q).slice(0, SEARCH_LIMIT),
    status: oneOf(query.status, PAYOUT_STATUSES),
    route: oneOf(query.route, ROUTE_IDS),
    currency: oneOf(query.currency, TARGET_CURRENCIES),
    selected: PAYOUT_ID.test(selected) ? selected : null,
    sort: parseSort(query.sort),
  }
}
