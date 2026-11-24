import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsButton from '../components/DsButton.vue'
import DsDialog from '../components/DsDialog.vue'
import DsDrawer from '../components/DsDrawer.vue'

const meta: Meta = {
  title: 'Components/Drawer and Dialog',
  parameters: {
    docs: {
      description: {
        component:
          'Both trap keyboard focus while open, close on Escape, and return focus to the control that opened them. The parent owns the open state: the component only asks to close.',
      },
    },
  },
}
export default meta
type Story = StoryObj

export const DrawerRight: Story = {
  name: 'Drawer, right',
  render: () => ({
    components: { DsButton, DsDrawer },
    setup: () => ({ open: ref(false) }),
    template: `
      <DsButton @click="open = true">Open drawer</DsButton>
      <DsDrawer :open="open" title="Payout PO-48260" @close="open = false">
        <p style="padding:16px">Detail content goes here. Press Tab to see focus stay inside, and Escape to close.</p>
        <template #footer><DsButton @click="open = false">Close</DsButton></template>
      </DsDrawer>`,
  }),
}

export const DrawerBottom: Story = {
  name: 'Drawer, bottom',
  render: () => ({
    components: { DsButton, DsDrawer },
    setup: () => ({ open: ref(false) }),
    template: `
      <DsButton @click="open = true">Open request log</DsButton>
      <DsDrawer :open="open" title="Request log" side="bottom" @close="open = false">
        <p style="padding:16px">A bottom drawer keeps the page above it in view.</p>
      </DsDrawer>`,
  }),
}

export const Dialog: Story = {
  render: () => ({
    components: { DsButton, DsDialog },
    setup: () => ({ open: ref(false) }),
    template: `
      <DsButton @click="open = true">Reset demo data</DsButton>
      <DsDialog :open="open" title="Reset demo data?" @close="open = false">
        <p>This restores the seeded instructions and removes the ones made in this tab.</p>
        <template #actions>
          <DsButton data-autofocus @click="open = false">Keep my changes</DsButton>
          <DsButton variant="primary" @click="open = false">Reset demo data</DsButton>
        </template>
      </DsDialog>`,
  }),
}
