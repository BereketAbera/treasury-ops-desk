import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsField from '../components/DsField.vue'
import DsMoneyInput from '../components/DsMoneyInput.vue'

const meta: Meta<typeof DsMoneyInput> = {
  title: 'Components/MoneyInput',
  component: DsMoneyInput,
  args: { currency: 'NGN', decimals: 2, invalid: false, disabled: false },
  argTypes: {
    currency: { control: 'text' },
    decimals: { control: 'inline-radio', options: [0, 2, 6] },
    // Set by Field through its slot, or bound with v-model in the story.
    id: { control: false },
    describedBy: { control: false },
    modelValue: { control: false },
    text: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'v-model is the amount in minor units as an integer string, or null while the text is not a valid amount. It is never a float. Extra decimal places are reported through the problem event and are never rounded away. The decimal separator is a point. A comma is accepted only as a thousands separator in a valid position, so 1,000.50 is an amount and 1000,50 is a problem, not 100,050.',
      },
    },
  },
  render: (args) => ({
    components: { DsField, DsMoneyInput },
    setup: () => {
      const minor = ref<string | null>(null)
      const text = ref('')
      const problem = ref<string | null>(null)
      return { args, minor, text, problem }
    },
    template: `
      <div style="max-width:320px;display:grid;gap:12px">
        <DsField label="Amount the beneficiary receives" required :hint="'Up to ' + args.decimals + ' decimal places.'">
          <template #default="field">
            <DsMoneyInput v-model="minor" v-model:text="text" v-bind="{ ...args, ...field }" @problem="problem = $event" />
          </template>
        </DsField>
        <dl class="kv">
          <dt>v-model</dt><dd><code>{{ minor === null ? 'null' : '"' + minor + '"' }}</code></dd>
          <dt>problem</dt><dd><code>{{ problem ?? 'null' }}</code></dd>
        </dl>
      </div>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsMoneyInput>

export const TwoDecimals: Story = { name: 'Two decimals (NGN)' }
export const ZeroDecimals: Story = { name: 'Zero decimals (UGX)', args: { currency: 'UGX', decimals: 0 } }
export const SixDecimals: Story = { name: 'Six decimals (USDC)', args: { currency: 'USDC', decimals: 6 } }
export const Invalid: Story = { args: { invalid: true } }
export const Disabled: Story = { args: { disabled: true } }
