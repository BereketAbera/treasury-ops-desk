import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsField from '../components/DsField.vue'
import DsTextInput from '../components/DsTextInput.vue'

const meta: Meta<typeof DsField> = {
  title: 'Components/Field',
  component: DsField,
  args: { label: 'Your reference', hint: '4 to 20 capital letters, digits or hyphens.', required: true, error: '', id: '' },
  argTypes: {
    label: { control: 'text' },
    hint: { control: 'text' },
    error: { control: 'text' },
    id: { control: 'text' },
  },
  parameters: {
    docs: {
      description: {
        component:
          'Field owns the label, hint and error. Its default slot hands the control an id, the ids that describe it and an invalid flag, so the wiring for screen readers cannot be forgotten.',
      },
    },
  },
  render: (args) => ({
    components: { DsField, DsTextInput },
    setup: () => ({ args, value: ref('INV-20418') }),
    template: `
      <div style="max-width:360px">
        <DsField v-bind="args">
          <template #default="field"><DsTextInput v-model="value" v-bind="field" mono /></template>
        </DsField>
      </div>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsField>

export const Default: Story = {}
export const WithError: Story = { args: { error: 'Use 4 to 20 capital letters, digits or hyphens, for example INV-20418.' } }
export const Optional: Story = { args: { label: 'Note to approver', hint: '', required: false } }
