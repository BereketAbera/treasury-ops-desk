import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsRate from '../components/DsRate.vue'

const meta: Meta<typeof DsRate> = {
  title: 'Components/Rate',
  component: DsRate,
  args: { rate: '3712.46', places: 2 },
  argTypes: {
    rate: { control: 'text', description: 'The rate as a decimal string.' },
    places: { control: { type: 'number', min: 0, max: 8, step: 1 } },
    alignPlaces: { control: { type: 'number', min: 1, max: 8, step: 1 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A rate with grouped digits and a fixed number of decimal places. In a right-aligned column, give every cell the same alignPlaces and rates quoted to 2 and to 4 places line up on the decimal point.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof DsRate>

export const Default: Story = {}
export const AlignedColumn: Story = {
  name: 'Aligned in a column',
  parameters: { controls: { disable: true } },
  render: () => ({
    components: { DsRate },
    template: `
      <div style="display:grid;gap:4px;justify-items:end;max-width:160px">
        <DsRate rate="3712.46" :places="2" :align-places="4" />
        <DsRate rate="18.274" :places="4" :align-places="4" />
        <DsRate rate="129.3" :places="2" :align-places="4" />
        <DsRate rate="0.9992" :places="4" :align-places="4" />
      </div>`,
  }),
}
