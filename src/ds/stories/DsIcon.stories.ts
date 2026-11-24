import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsIcon from '../components/DsIcon.vue'
import { ICON_NAMES } from '../components/icons'

const meta: Meta<typeof DsIcon> = {
  title: 'Components/Icon',
  component: DsIcon,
  args: { name: 'check-circle', size: 16, title: '' },
  argTypes: {
    name: { control: 'select', options: ICON_NAMES },
    size: { control: { type: 'number', min: 12, max: 48, step: 2 } },
    title: { control: 'text' },
  },
  parameters: {
    docs: {
      description: { component: 'Line icons on a 16 by 16 grid. An icon is hidden from screen readers unless it is given a title, which is for icons with no text beside them.' },
    },
  },
}
export default meta
type Story = StoryObj<typeof DsIcon>

export const One: Story = {}
export const EveryIcon: Story = {
  name: 'Every icon',
  parameters: { controls: { disable: true } },
  render: () => ({
    components: { DsIcon },
    setup: () => ({ names: ICON_NAMES }),
    template: `
      <ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:0;padding:0;list-style:none">
        <li v-for="name in names" :key="name" style="display:flex;align-items:center;gap:8px"><DsIcon :name="name" /> <code>{{ name }}</code></li>
      </ul>`,
  }),
}
