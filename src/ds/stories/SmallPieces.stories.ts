import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsAmount from '../components/DsAmount.vue'
import DsCopyButton from '../components/DsCopyButton.vue'
import DsIcon from '../components/DsIcon.vue'
import DsSegmented from '../components/DsSegmented.vue'
import { ICON_NAMES } from '../components/icons'

const meta: Meta = { title: 'Components/Amount, CopyButton, Segmented, Icon' }
export default meta
type Story = StoryObj

export const Amount: Story = {
  render: () => ({
    components: { DsAmount },
    template: `
      <div style="display:grid;gap:4px;justify-items:end;max-width:260px">
        <DsAmount minor="245000000" currency="NGN" :decimals="2" />
        <DsAmount minor="7450000" currency="UGX" :decimals="0" />
        <DsAmount minor="1548232172" currency="USDC" :decimals="6" />
      </div>`,
  }),
}

export const CopyButton: Story = {
  render: () => ({
    components: { DsCopyButton },
    template: `
      <span style="display:inline-flex;align-items:center;gap:4px">
        <span class="mono">cor_3f9a1c20b7d44e01a6c2</span>
        <DsCopyButton value="cor_3f9a1c20b7d44e01a6c2" label="Copy correlation ID" />
      </span>`,
  }),
}

export const Segmented: Story = {
  render: () => ({
    components: { DsSegmented },
    setup: () => ({
      value: ref('default'),
      options: [
        { value: 'compact', label: '24' },
        { value: 'default', label: '32' },
        { value: 'relaxed', label: '40' },
      ],
    }),
    template: '<DsSegmented v-model="value" legend="Row height" :options="options" />',
  }),
}

export const Icons: Story = {
  render: () => ({
    components: { DsIcon },
    setup: () => ({ names: ICON_NAMES }),
    template: `
      <ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:0;padding:0;list-style:none">
        <li v-for="name in names" :key="name" style="display:flex;align-items:center;gap:8px"><DsIcon :name="name" /> <code>{{ name }}</code></li>
      </ul>`,
  }),
}
