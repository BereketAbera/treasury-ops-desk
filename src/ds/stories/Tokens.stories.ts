import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { tokens } from '../tokens/tokens'

const meta: Meta = {
  title: 'Foundations/Tokens',
  parameters: {
    docs: {
      description: {
        component:
          'Every value comes from tokens/tokens.json. A script turns that file into SCSS variables, CSS custom properties and a typed object. Components read the custom properties; SCSS variables are used only where a custom property cannot go, such as a media query.',
      },
    },
  },
}
export default meta

export const Colour: StoryObj = {
  render: () => ({
    setup: () => ({ colours: Object.entries(tokens.color) }),
    template: `
      <ul style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;margin:0;padding:0;list-style:none">
        <li v-for="[name, value] in colours" :key="name" style="display:flex;align-items:center;gap:12px">
          <span :style="{ background: value, width: '40px', height: '40px', borderRadius: '4px', border: '1px solid #7A8794', flex: 'none' }"></span>
          <span><code>--color-{{ name }}</code><br /><span class="muted">{{ value }}</span></span>
        </li>
      </ul>`,
  }),
}

export const StatusPairs: StoryObj = {
  name: 'Status text on tint',
  render: () => ({
    setup: () => ({ tones: ['success', 'warning', 'danger', 'info', 'neutral', 'unknown'] }),
    template: `
      <div style="display:grid;gap:8px;max-width:520px">
        <p v-for="tone in tones" :key="tone" :style="{ background: 'var(--color-' + tone + '-tint)', color: 'var(--color-' + tone + '-text)', padding: '8px 12px', borderRadius: '4px', fontWeight: 600 }">
          {{ tone }}: text on tint passes WCAG AA for normal text
        </p>
      </div>`,
  }),
}

export const SpaceAndType: StoryObj = {
  name: 'Space, type, radius, size, motion',
  render: () => ({
    setup: () => ({
      groups: (['space', 'font', 'radius', 'size', 'motion', 'breakpoint'] as const).map((group) => ({
        group,
        values: Object.entries(tokens[group]),
      })),
    }),
    template: `
      <div style="display:grid;gap:24px">
        <table v-for="item in groups" :key="item.group" class="plain-table" style="max-width:720px">
          <caption style="text-align:left;font-weight:600;padding-bottom:4px">{{ item.group }}</caption>
          <thead><tr><th scope="col">Custom property</th><th scope="col">Value</th></tr></thead>
          <tbody>
            <tr v-for="[name, value] in item.values" :key="name">
              <td><code>--{{ item.group }}-{{ name }}</code></td>
              <td>{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </div>`,
  }),
}
