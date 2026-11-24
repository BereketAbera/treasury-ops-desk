import { create } from 'storybook/theming/create'
import { tokens } from '../src/ds/tokens/tokens'

// Storybook's own shell, in the product's tokens. The stories already use them.
const { color, font, radius } = tokens

export default create({
  base: 'light',
  brandTitle: 'Payout desk component library',
  brandUrl: '/',
  brandImage: './brand.svg',
  brandTarget: '_self',

  colorPrimary: color.primary,
  colorSecondary: color.primary,

  appBg: color.canvas,
  appContentBg: color.surface,
  appPreviewBg: color.surface,
  appBorderColor: color.divider,
  appBorderRadius: parseInt(radius.md, 10),

  fontBase: font['family-ui'],
  fontCode: font['family-mono'],

  textColor: color.ink,
  textInverseColor: color['on-primary'],
  textMutedColor: color.muted,

  barBg: color.surface,
  barTextColor: color.muted,
  barHoverColor: color.primary,
  barSelectedColor: color.primary,

  buttonBg: color.surface,
  buttonBorder: color['control-border'],
  booleanBg: color['neutral-tint'],
  booleanSelectedBg: color.surface,

  inputBg: color.surface,
  inputBorder: color['control-border'],
  inputTextColor: color.ink,
  inputBorderRadius: parseInt(radius.md, 10),
})
