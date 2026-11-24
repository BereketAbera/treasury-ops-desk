import type { Preview } from '@storybook/vue3-vite'
import '../src/ds/tokens/tokens.css'
import '../src/styles/main.scss'

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: { order: ['Foundations', 'Components'] },
    },
  },
}

export default preview
