import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { computed, ref, type ConcreteComponent } from 'vue'
import DsAmount from '../components/DsAmount.vue'
import DsDataTable from '../components/DsDataTable.vue'
import DsStatusBadge from '../components/DsStatusBadge.vue'
import type { StatusName } from '../components/status'
import type { TableColumn, TableSort } from '../components/table'

interface Row {
  id: string
  beneficiary: string
  minor: string
  currency: string
  decimals: number
  status: StatusName
}

const ROWS: Row[] = [
  { id: 'PO-48260', beneficiary: 'Gulu Maize Millers', minor: '2316150', currency: 'XOF', decimals: 0, status: 'completed' },
  { id: 'PO-48259', beneficiary: 'Kumasi Timber Yard', minor: '39350000000', currency: 'USDC', decimals: 6, status: 'sent' },
  { id: 'PO-48258', beneficiary: 'Ibadan Steel Fabricators', minor: '89323800', currency: 'UGX', decimals: 0, status: 'awaiting_approval' },
  { id: 'PO-48257', beneficiary: 'Volta Cold Chain', minor: '39385000', currency: 'NGN', decimals: 2, status: 'failed' },
  { id: 'PO-48256', beneficiary: 'Zuri Print Works', minor: '48545062', currency: 'KES', decimals: 2, status: 'outcome_unknown' },
]

const COLUMNS: TableColumn<Row>[] = [
  { key: 'id', label: 'Reference', sortable: true },
  { key: 'beneficiary', label: 'Beneficiary', sortable: true, text: (row) => row.beneficiary },
  { key: 'amount', label: 'Target amount', align: 'right', numeric: true },
  { key: 'status', label: 'Status', sortable: true },
]

// A generic component has no single concrete type, so it is registered through a plain component type here.
const Table = DsDataTable as unknown as ConcreteComponent

const meta: Meta = {
  title: 'Components/DataTable',
  component: Table,
  args: { density: 'default', loading: false, empty: false },
  argTypes: {
    density: { control: 'inline-radio', options: ['compact', 'default', 'relaxed'] },
    loading: { control: 'boolean' },
    empty: { control: 'boolean', description: 'Story only: show the table with no rows.' },
    // Data and functions are set in code. The story supplies them.
    columns: { control: false },
    rows: { control: false },
    rowKey: { control: false },
    sort: { control: false },
    selectedKey: { control: false },
    caption: { control: false },
    emptyText: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'The table is controlled: it reports the sort and the opened row, and the parent decides what the rows are. Rows take keyboard focus one at a time. Arrow keys, Home, End, Page Up and Page Down move between rows; Enter or Space opens one. Below 720 pixels each row becomes a card, the header row is removed, and a "Sort by" select takes its place.',
      },
    },
  },
  render: (args) => ({
    components: { DsDataTable: Table, DsAmount, DsStatusBadge },
    setup: () => {
      const sort = ref<TableSort | null>({ key: 'id', direction: 'desc' })
      const selected = ref<string | null>(null)
      const rows = computed(() => {
        if (args.empty) return []
        const current = sort.value
        if (!current) return ROWS
        const factor = current.direction === 'asc' ? 1 : -1
        return [...ROWS].sort((a, b) => factor * String(a[current.key as keyof Row]).localeCompare(String(b[current.key as keyof Row])))
      })
      return { args, sort, selected, rows, columns: COLUMNS, rowKey: (row: Row) => row.id }
    },
    template: `
      <div style="border:1px solid var(--color-divider)">
        <DsDataTable
          caption="Payout instructions"
          :columns="columns"
          :rows="rows"
          :row-key="rowKey"
          :density="args.density"
          :loading="args.loading"
          :selected-key="selected"
          v-model:sort="sort"
          empty-text="No instructions match these filters."
          @select="selected = $event.id"
        >
          <template #cell-id="{ row }"><span class="mono">{{ row.id }}</span></template>
          <template #cell-amount="{ row }"><DsAmount :minor="row.minor" :currency="row.currency" :decimals="row.decimals" /></template>
          <template #cell-status="{ row }"><DsStatusBadge :status="row.status" /></template>
        </DsDataTable>
      </div>`,
  }),
}
export default meta
type Story = StoryObj

export const Default: Story = {}
export const Compact: Story = { args: { density: 'compact' } }
export const Relaxed: Story = { args: { density: 'relaxed' } }
export const Loading: Story = { args: { loading: true } }
export const Empty: Story = { args: { empty: true } }
