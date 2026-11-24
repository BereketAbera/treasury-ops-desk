import type { Meta, StoryObj } from '@storybook/vue3-vite'
import { ref } from 'vue'
import DsButton from '../components/DsButton.vue'
import DsCountdown from '../components/DsCountdown.vue'

const meta: Meta<typeof DsCountdown> = {
  title: 'Components/Countdown',
  component: DsCountdown,
  args: { seconds: 30 } as never,
  argTypes: {
    seconds: { control: { type: 'number', min: 0, max: 120, step: 1 }, description: 'Story only: seconds until the countdown ends.' },
    warnAt: { control: { type: 'number', min: 0, max: 60, step: 1 } },
    label: { control: 'text' },
    expiredLabel: { control: 'text' },
    // A moment in time and a clock function: set by the story, not typed in.
    expiresAt: { control: false },
    now: { control: false },
  } as never,
  parameters: {
    docs: {
      description: {
        component:
          'Counts down to a moment in time and emits "expired" once. It takes the expiry time, not a duration, so a re-render or a slow tab cannot stretch the deadline.',
      },
    },
  },
  render: (args) => ({
    components: { DsButton, DsCountdown },
    setup: () => {
      const seconds = (args as { seconds?: number }).seconds ?? 30
      const expiresAt = ref(Date.now() + seconds * 1000)
      const events = ref(0)
      const restart = () => (expiresAt.value = Date.now() + seconds * 1000)
      return { expiresAt, events, restart }
    },
    template: `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <DsCountdown :expires-at="expiresAt" label="Held for" expired-label="Rate expired" @expired="events += 1" />
        <DsButton size="sm" @click="restart">Restart</DsButton>
        <span class="muted">expired events: {{ events }}</span>
      </div>`,
  }),
}
export default meta
type Story = StoryObj<typeof DsCountdown & { seconds: number }>

export const ThirtySeconds: Story = { args: { seconds: 30 } as never }
export const Warning: Story = { name: 'Under ten seconds', args: { seconds: 8 } as never }
export const Expired: Story = { args: { seconds: 0 } as never }
