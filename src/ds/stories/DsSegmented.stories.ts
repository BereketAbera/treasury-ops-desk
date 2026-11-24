import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsSegmented from '../components/DsSegmented.vue'

const OPTIONS = [
  { value: 'compact', label: '24' },
  { value: 'default', label: '32' },
  { value: 'relaxed', label: '40' },
]

const meta: Meta<typeof DsSegmented> = {
  title: 'Components/Segmented',
  component: DsSegmented,
  args: { legend: 'Row height' },
  argTypes: {
    legend: { control: 'text' },
    // A list of objects is set in code, not in a text box.
    options: { control: false },
    modelValue: { control: false },
  },
  parameters: {
    docs: {
      description: { component: 'A small set of exclusive choices, built on radio inputs so arrow keys and screen readers work without extra code.' },
    },
  },
  render: (args) => ({
    components: { DsSegmented },
    setup: () => ({ args, value: ref('default'), options: OPTIONS }),
    template: '<DsSegmented v-model="value" :legend="args.legend" :options="options" />',
  }),
}
export default meta
type Story = StoryObj<typeof DsSegmented>

export const Default: Story = {}
