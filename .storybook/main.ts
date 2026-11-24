import type { StorybookConfig } from '@storybook/vue3-vite'

const config: StorybookConfig = {
  stories: ['../src/ds/stories/*.stories.ts'],
  addons: ['@storybook/addon-docs'],
  framework: { name: '@storybook/vue3-vite', options: {} },
  core: { disableTelemetry: true, disableWhatsNewNotifications: true },
  // The app's public folder holds the mock API worker and the sample file. Storybook needs neither.
  viteFinal: (viteConfig) => ({ ...viteConfig, publicDir: false }),
}

export default config
