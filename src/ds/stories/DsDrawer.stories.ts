import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsButton from '../components/DsButton.vue'
import DsDrawer from '../components/DsDrawer.vue'

const meta: Meta<typeof DsDrawer> = {
  title: 'Components/Drawer',
  component: DsDrawer,
  args: { title: 'Payout PO-48260', side: 'right' },
  argTypes: {
    title: { control: 'text' },
    side: { control: 'inline-radio', options: ['right', 'bottom'] },
    // The story owns the open state through its button.
    open: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          'A panel attached to the right or the bottom edge. It traps keyboard focus while open, closes on Escape or a click outside, and returns focus to the control that opened it. The parent owns the open state: the drawer only asks to close.',
      },
    },
  },
  render: (args) => ({
    components: { DsButton, DsDrawer },
    setup: () => ({ args, open: ref(false) }),
    template: `
      <DsButton @click="open = true">Open drawer</DsButton>
      <DsDrawer :title="args.title" :side="args.side" :open="open" @close="open = false">
        <p style="padding:16px">Detail content goes here. Press Tab to see focus stay inside, and Escape to close.</p>
        <template #footer><DsButton @click="open = false">Close</DsButton></template>
      </DsDrawer>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsDrawer>

export const Right: Story = {}
export const Bottom: Story = { args: { title: 'Request log', side: 'bottom' } }
