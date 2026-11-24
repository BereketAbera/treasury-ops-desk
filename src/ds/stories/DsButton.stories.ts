import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DsButton from '../components/DsButton.vue'
import { ICON_NAMES } from '../components/icons'

const meta: Meta<typeof DsButton> = {
  title: 'Components/Button',
  component: DsButton,
  args: { variant: 'primary', size: 'md', loading: false, disabled: false, href: '' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    type: { control: 'inline-radio', options: ['button', 'submit'] },
    icon: { control: 'select', options: [undefined, ...ICON_NAMES] },
    href: { control: 'text' },
  },
  render: (args) => ({
    components: { DsButton },
    setup: () => ({ args }),
    template: '<DsButton v-bind="args">Submit payout</DsButton>',
  }),
}
export default meta
type Story = StoryObj<typeof DsButton>

export const Primary: Story = {}
export const Secondary: Story = { args: { variant: 'secondary' } }
export const Ghost: Story = { args: { variant: 'ghost', icon: 'refresh' } }
export const Danger: Story = { args: { variant: 'danger' } }
export const Small: Story = { args: { variant: 'secondary', size: 'sm' } }
export const WithIcon: Story = { args: { icon: 'plus' } }
export const Loading: Story = {
  args: { loading: true },
  parameters: {
    docs: { description: { story: 'While loading the button keeps focus, sets aria-busy and ignores clicks, so a double click sends one request.' } },
  },
}
export const Disabled: Story = { args: { disabled: true } }
export const AsLink: Story = { args: { href: '#', variant: 'secondary' } }
