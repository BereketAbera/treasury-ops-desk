export interface TableColumn<Row> {
  /** Unique key. Also names the cell slot: `cell-<key>`. */
  key: string
  label: string
  align?: 'left' | 'right'
  sortable?: boolean
  /** Plain text for the cell when no cell slot is given. */
  text?: (row: Row) => string
  /** Tabular numerals, for amounts and rates. */
  numeric?: boolean
  /** Left out of the stacked phone layout. */
  hideOnPhone?: boolean
}

export interface TableSort {
  key: string
  direction: 'asc' | 'desc'
}

export type TableDensity = 'compact' | 'default' | 'relaxed'

export function nextSort(current: TableSort | null, key: string): TableSort {
  if (current?.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
  return { key, direction: 'asc' }
}
