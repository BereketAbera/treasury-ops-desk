import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DsStatusBadge from '@/ds/components/DsStatusBadge.vue'
import { STATUS_LOOK, STATUS_NAMES } from '@/ds/components/status'

describe('DsStatusBadge', () => {
  it('shows a text label and an icon for every status, so colour is never the only signal', () => {
    for (const status of STATUS_NAMES) {
      const wrapper = mount(DsStatusBadge, { props: { status } })
      expect(wrapper.text(), status).toBe(STATUS_LOOK[status].label)
      expect(wrapper.find('svg').exists(), status).toBe(true)
      expect(wrapper.classes(), status).toContain(`ds-badge--${STATUS_LOOK[status].tone}`)
    }
  })

  it('follows the status mapping of the design direction', () => {
    const tone = (status: (typeof STATUS_NAMES)[number]) => STATUS_LOOK[status].tone
    expect([tone('draft'), tone('cancelled')]).toEqual(['neutral', 'neutral'])
    expect([tone('awaiting_approval'), tone('quote_expiring'), tone('partially_completed')]).toEqual(['warning', 'warning', 'warning'])
    expect([tone('processing'), tone('sent')]).toEqual(['info', 'info'])
    expect(tone('completed')).toBe('success')
    expect([tone('failed'), tone('rejected'), tone('returned')]).toEqual(['danger', 'danger', 'danger'])
    expect(tone('outcome_unknown')).toBe('unknown')
  })

  it('gives statuses with the same tone different icons where they sit side by side', () => {
    expect(new Set(['failed', 'rejected', 'returned'].map((status) => STATUS_LOOK[status as 'failed'].icon)).size).toBe(3)
    expect(STATUS_LOOK.processing.icon).not.toBe(STATUS_LOOK.sent.icon)
  })

  it('replaces the text with a custom label and keeps the tone', () => {
    const wrapper = mount(DsStatusBadge, { props: { status: 'partially_completed', label: '9 of 12 booked' } })
    expect(wrapper.text()).toBe('9 of 12 booked')
    expect(wrapper.classes()).toContain('ds-badge--warning')
  })

  it('hides the icon from screen readers, which read the text', () => {
    const wrapper = mount(DsStatusBadge, { props: { status: 'outcome_unknown' } })
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  })
})
