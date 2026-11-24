import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsCopyButton from '../components/DsCopyButton.vue'

const meta: Meta<typeof DsCopyButton> = {
  title: 'Components/CopyButton',
  component: DsCopyButton,
  args: { value: 'cor_3f9a1c20b7d44e01a6c2', label: 'Copy correlation ID' },
  argTypes: { value: { control: 'text' }, label: { control: 'text' } },
  parameters: {
    docs: {
      description: {
        component: 'Copies a value and says "Copied" to screen readers. The label names what is copied, because the button shows only an icon.',
      },
    },
  },
  render: (args) => ({
    components: { DsCopyButton },
    setup: () => ({ args }),
    template: `
      <span style="display:inline-flex;align-items:center;gap:4px">
        <span class="mono">{{ args.value }}</span>
        <DsCopyButton v-bind="args" />
      </span>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsCopyButton>

export const Default: Story = {}
