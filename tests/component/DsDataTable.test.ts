import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DsDataTable from '@/ds/components/DsDataTable.vue'
import { nextSort, type TableColumn } from '@/ds/components/table'

interface Row {
  id: string
  name: string
}

const rows: Row[] = Array.from({ length: 14 }, (_, index) => ({ id: `PO-${index + 1}`, name: `Beneficiary ${index + 1}` }))
const columns: TableColumn<Row>[] = [
  { key: 'id', label: 'Reference', sortable: true, text: (row) => row.id },
  { key: 'name', label: 'Beneficiary', sortable: true, text: (row) => row.name },
  { key: 'note', label: 'Note', hideOnPhone: true },
]

function mountTable(props: Record<string, unknown> = {}) {
  return mount(DsDataTable<Row>, {
    attachTo: document.body,
    props: { columns, rows, rowKey: (row: Row) => row.id, caption: 'Payout instructions', ...props },
  })
}

const press = (wrapper: ReturnType<typeof mountTable>, key: string) =>
  (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })) && wrapper.vm.$nextTick()

describe('DsDataTable sorting', () => {
  it('cycles a column from ascending to descending and starts a new column ascending', () => {
    expect(nextSort(null, 'id')).toEqual({ key: 'id', direction: 'asc' })
    expect(nextSort({ key: 'id', direction: 'asc' }, 'id')).toEqual({ key: 'id', direction: 'desc' })
    expect(nextSort({ key: 'id', direction: 'desc' }, 'id')).toEqual({ key: 'id', direction: 'asc' })
    expect(nextSort({ key: 'id', direction: 'desc' }, 'name')).toEqual({ key: 'name', direction: 'asc' })
  })

  it('emits the requested sort from the header button and does not reorder rows itself', async () => {
    const wrapper = mountTable({ sort: { key: 'id', direction: 'asc' } })
    await wrapper.findAll('th button')[0]!.trigger('click')
    expect(wrapper.emitted('update:sort')?.[0]).toEqual([{ key: 'id', direction: 'desc' }])
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('PO-1')
    wrapper.unmount()
  })

  it('reports the sort state to screen readers on sortable headers only', () => {
    const wrapper = mountTable({ sort: { key: 'name', direction: 'desc' } })
    const headers = wrapper.findAll('th')
    expect(headers[0]!.attributes('aria-sort')).toBe('none')
    expect(headers[1]!.attributes('aria-sort')).toBe('descending')
    expect(headers[2]!.attributes('aria-sort')).toBeUndefined()
    expect(headers[2]!.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('DsDataTable keyboard navigation', () => {
  it('keeps one row in the tab order', () => {
    const wrapper = mountTable()
    const tabbable = wrapper.findAll('tbody tr').filter((row) => row.attributes('tabindex') === '0')
    expect(tabbable).toHaveLength(1)
    expect(tabbable[0]!.text()).toContain('PO-1')
    wrapper.unmount()
  })

  it('moves focus with the arrow keys, Home, End and the page keys', async () => {
    const wrapper = mountTable()
    const row = (index: number) => wrapper.findAll('tbody tr')[index]!.element as HTMLElement
    row(0).focus()
    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'ArrowDown')
    expect(document.activeElement).toBe(row(2))
    await press(wrapper, 'ArrowUp')
    expect(document.activeElement).toBe(row(1))
    await press(wrapper, 'End')
    expect(document.activeElement).toBe(row(13))
    await press(wrapper, 'ArrowDown')
    expect(document.activeElement).toBe(row(13))
    await press(wrapper, 'Home')
    expect(document.activeElement).toBe(row(0))
    await press(wrapper, 'PageDown')
    expect(document.activeElement).toBe(row(10))
    expect(row(10).getAttribute('tabindex')).toBe('0')
    expect(row(0).getAttribute('tabindex')).toBe('-1')
    wrapper.unmount()
  })

  it('opens the focused row with Enter or Space, and a row with a click', async () => {
    const wrapper = mountTable()
    const first = wrapper.findAll('tbody tr')[0]!
    ;(first.element as HTMLElement).focus()
    await press(wrapper, 'ArrowDown')
    await press(wrapper, 'Enter')
    await press(wrapper, ' ')
    await wrapper.findAll('tbody tr')[4]!.trigger('click')
    expect(wrapper.emitted('select')?.map((call) => (call[0] as Row).id)).toEqual(['PO-2', 'PO-2', 'PO-5'])
    wrapper.unmount()
  })

  it('marks the selected row for assistive technology', () => {
    const wrapper = mountTable({ selectedKey: 'PO-3' })
    const selected = wrapper.findAll('tbody tr').filter((row) => row.attributes('aria-current') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]!.text()).toContain('PO-3')
    wrapper.unmount()
  })
})

describe('DsDataTable states', () => {
  it('shows placeholder rows and aria-busy while loading', () => {
    const wrapper = mountTable({ loading: true })
    expect(wrapper.get('table').attributes('aria-busy')).toBe('true')
    expect(wrapper.findAll('.ds-table__skeleton').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('PO-1')
    wrapper.unmount()
  })

  it('shows the empty text when there are no rows', () => {
    const wrapper = mountTable({ rows: [], emptyText: 'No instructions match these filters.' })
    expect(wrapper.get('.ds-table__empty').text()).toBe('No instructions match these filters.')
    wrapper.unmount()
  })

  it('names the table, labels each cell for the phone layout, and applies the density', () => {
    const wrapper = mountTable({ density: 'compact' })
    expect(wrapper.get('caption').text()).toBe('Payout instructions')
    expect(wrapper.get('tbody td').attributes('data-label')).toBe('Reference')
    expect(wrapper.classes()).toContain('ds-table--compact')
    expect(wrapper.findAll('tbody tr')[0]!.findAll('td')[2]!.classes()).toContain('ds-table__cell--hide-phone')
    wrapper.unmount()
  })
})
