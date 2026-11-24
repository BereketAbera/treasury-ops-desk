import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsField from '../components/DsField.vue'
import DsSelect from '../components/DsSelect.vue'

const OPTIONS = [
  { value: 'USDC-NGN', label: 'USDC to NGN' },
  { value: 'USDC-KES', label: 'USDC to KES' },
  { value: 'USDC-UGX', label: 'USDC to UGX' },
]

const meta: Meta<typeof DsSelect> = {
  title: 'Components/Select',
  component: DsSelect,
  args: { placeholder: 'Choose a route', disabled: false, invalid: false, required: false },
  argTypes: {
    placeholder: { control: 'text' },
    // A list of objects is set in code, not in a text box.
    options: { control: false },
    // Set by Field through its slot, not by hand.
    id: { control: false },
    describedBy: { control: false },
    modelValue: { control: false },
  },
  parameters: {
    docs: { description: { component: 'A native select with the library look. Native, so it works with every keyboard, screen reader and phone picker.' } },
  },
  render: (args) => ({
    components: { DsField, DsSelect },
    setup: () => ({ args, value: ref(''), options: OPTIONS }),
    template: `
      <div style="max-width:360px">
        <DsField label="Route" hint="Source currency to target currency.">
          <template #default="field"><DsSelect v-model="value" v-bind="{ ...args, ...field }" :options="options" /></template>
        </DsField>
      </div>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsSelect>

export const Default: Story = {}
export const Disabled: Story = { args: { disabled: true } }
