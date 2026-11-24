import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsStatusBadge from '../components/DsStatusBadge.vue'
import { STATUS_LOOK, STATUS_NAMES } from '../components/status'

const meta: Meta<typeof DsStatusBadge> = {
  title: 'Components/StatusBadge',
  component: DsStatusBadge,
  args: { status: 'completed' },
  argTypes: { status: { control: 'select', options: STATUS_NAMES } },
  parameters: {
    docs: {
      description: {
        component:
          'The prop is a status, not a colour. One map gives each status a tone, an icon and a label, so colour is never the only signal.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof DsStatusBadge>

export const One: Story = {}
export const WithCounts: Story = { args: { status: 'partially_completed', label: '9 of 12 booked' } }
export const EveryStatus: Story = {
  render: () => ({
    components: { DsStatusBadge },
    setup: () => ({ rows: STATUS_NAMES.map((status) => ({ status, ...STATUS_LOOK[status] })) }),
    template: `
      <table class="plain-table" style="max-width:560px">
        <thead><tr><th scope="col">Status</th><th scope="col">Badge</th><th scope="col">Tone</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.status">
            <td><code>{{ row.status }}</code></td>
            <td><DsStatusBadge :status="row.status" /></td>
            <td>{{ row.tone }}</td>
          </tr>
        </tbody>
      </table>`,
  }),
}
