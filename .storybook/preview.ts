import type { Preview } from '@storybook/vue3-vite'
import '../src/ds/tokens/tokens.css'
import '../src/styles/main.scss'
import theme from './theme'

const preview: Preview = {
  tags: ['autodocs'],
  // A slot is filled in the story's template. It has no value to type into the Controls panel.
  // An optional string prop starts as an empty string, so its control is a text box and not a "Set string" button.
  // An empty box reaches the component as "not set".
  decorators: [
    (story, context) =>
      story({
        args: Object.fromEntries(Object.entries(context.args).map(([name, value]) => [name, value === '' ? undefined : value])),
      }),
  ],
  argTypesEnhancers: [
    ({ argTypes }) =>
      Object.fromEntries(
        Object.entries(argTypes).map(([name, argType]) => [
          name,
          argType.table?.category === 'slots' ? { ...argType, control: false } : argType,
        ]),
      ),
  ],
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    docs: { theme },
    options: {
      storySort: { order: ['Foundations', 'Components'] },
    },
  },
}

export default preview
