import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsAmount from '../components/DsAmount.vue'

const meta: Meta<typeof DsAmount> = {
  title: 'Components/Amount',
  component: DsAmount,
  args: { minor: '245000000', currency: 'NGN', decimals: 2 },
  argTypes: {
    minor: { control: 'text', description: 'Integer string of minor units.' },
    currency: { control: 'text' },
    decimals: { control: { type: 'number', min: 0, max: 8, step: 1 } },
  },
  parameters: {
    docs: {
      description: {
        component: 'An amount for a table cell or a detail row: grouped digits in tabular numerals, the currency code after it in a muted colour.',
      },
    },
  },
}
export default meta
type Story = StoryObj<typeof DsAmount>

export const TwoDecimals: Story = { name: 'Two decimals (NGN)' }
export const ZeroDecimals: Story = { name: 'Zero decimals (UGX)', args: { minor: '7450000', currency: 'UGX', decimals: 0 } }
export const SixDecimals: Story = { name: 'Six decimals (USDC)', args: { minor: '1548232172', currency: 'USDC', decimals: 6 } }
export const InAColumn: Story = {
  name: 'In a column',
  parameters: { controls: { disable: true } },
  render: () => ({
    components: { DsAmount },
    template: `
      <div style="display:grid;gap:4px;justify-items:end;max-width:260px">
        <DsAmount minor="245000000" currency="NGN" :decimals="2" />
        <DsAmount minor="7450000" currency="UGX" :decimals="0" />
        <DsAmount minor="1548232172" currency="USDC" :decimals="6" />
      </div>`,
  }),
}
