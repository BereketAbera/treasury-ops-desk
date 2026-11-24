import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsBanner from '../components/DsBanner.vue'
import DsButton from '../components/DsButton.vue'

const meta: Meta<typeof DsBanner> = {
  title: 'Components/Banner',
  component: DsBanner,
  args: { tone: 'info', title: 'Sending', announce: 'none', dismissible: false },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'info', 'success', 'warning', 'danger', 'unknown'] },
    announce: { control: 'inline-radio', options: ['none', 'status', 'alert'] },
    title: { control: 'text' },
  },
  render: (args) => ({
    components: { DsBanner },
    setup: () => ({ args }),
    template: '<DsBanner v-bind="args"><p>Attempt 2 goes out in 1.4 seconds. Every attempt carries the same idempotency key.</p></DsBanner>',
  }),
}
export default meta
type Story = StoryObj<typeof DsBanner>

export const Info: Story = {}
export const Success: Story = { args: { tone: 'success', title: 'Payout accepted' } }
export const Warning: Story = { args: { tone: 'warning', title: 'Not sent: the service answered 503' } }
export const Danger: Story = { args: { tone: 'danger', title: 'Not accepted (422)' } }
export const Dismissible: Story = { args: { tone: 'info', title: 'What this is', dismissible: true } }
export const OutcomeUnknown: Story = {
  args: { tone: 'unknown', title: 'We could not confirm this payout', announce: 'alert' },
  render: (args) => ({
    components: { DsBanner, DsButton },
    setup: () => ({ args }),
    template: `
      <DsBanner v-bind="args">
        <p>No answer arrived within 4 seconds. Do not resend. Check status.</p>
        <template #actions><DsButton variant="primary">Check status</DsButton></template>
      </DsBanner>`,
  }),
}
