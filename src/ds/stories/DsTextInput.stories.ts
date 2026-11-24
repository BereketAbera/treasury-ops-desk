import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsField from '../components/DsField.vue'
import DsTextInput from '../components/DsTextInput.vue'

const meta: Meta<typeof DsTextInput> = {
  title: 'Components/TextInput',
  component: DsTextInput,
  args: { placeholder: 'INV-20418', mono: true, disabled: false, invalid: false, required: false, inputmode: 'text', autocomplete: 'off' },
  argTypes: {
    type: { control: 'inline-radio', options: ['text', 'search'] },
    inputmode: { control: 'select', options: ['text', 'numeric', 'decimal', 'search'] },
    placeholder: { control: 'text' },
    autocomplete: { control: 'text' },
    maxlength: { control: { type: 'number', min: 1, max: 200, step: 1 } },
    // Set by Field through its slot, not by hand.
    id: { control: false },
    describedBy: { control: false },
    modelValue: { control: false },
  },
  parameters: {
    docs: { description: { component: 'A one-line text input. Put it inside a Field, which gives it its label, hint and error wiring.' } },
  },
  render: (args) => ({
    components: { DsField, DsTextInput },
    setup: () => ({ args, value: ref('') }),
    template: `
      <div style="max-width:360px">
        <DsField label="Your reference" hint="4 to 20 capital letters, digits or hyphens.">
          <template #default="field"><DsTextInput v-model="value" v-bind="{ ...args, ...field }" /></template>
        </DsField>
      </div>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsTextInput>

export const Default: Story = {}
export const Disabled: Story = { args: { disabled: true } }
