import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsButton from '../components/DsButton.vue'
import DsDialog from '../components/DsDialog.vue'

const meta: Meta<typeof DsDialog> = {
  title: 'Components/Dialog',
  component: DsDialog,
  args: { title: 'Reset demo data?' },
  argTypes: {
    title: { control: 'text' },
    // The story owns the open state through its button.
    open: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A modal question with its actions. It traps keyboard focus, closes on Escape, and returns focus to the control that opened it. Mark the safest action with data-autofocus and it takes focus first.',
      },
    },
  },
  render: (args) => ({
    components: { DsButton, DsDialog },
    setup: () => ({ args, open: ref(false) }),
    template: `
      <DsButton @click="open = true">Reset demo data</DsButton>
      <DsDialog :title="args.title" :open="open" @close="open = false">
        <p>This restores the seeded instructions and removes the ones made in this tab.</p>
        <template #actions>
          <DsButton data-autofocus @click="open = false">Keep my changes</DsButton>
          <DsButton variant="primary" @click="open = false">Reset demo data</DsButton>
        </template>
      </DsDialog>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsDialog>

export const Default: Story = {}
