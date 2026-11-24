import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import DsCountdown from '@/ds/components/DsCountdown.vue'

const START = Date.parse('2026-11-24T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
})

afterEach(() => vi.useRealTimers())

describe('DsCountdown', () => {
  it('shows the time left with its label', () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START + 30_000, label: 'Held for' } })
    expect(wrapper.text()).toContain('Held for')
    expect(wrapper.text()).toContain('0:30')
    expect(wrapper.attributes('data-state')).toBe('running')
    expect(wrapper.attributes('role')).toBe('timer')
  })

  it('counts down and turns to the warning look near the end', async () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START + 30_000, warnAt: 10 } })
    await vi.advanceTimersByTimeAsync(19_000)
    expect(wrapper.text()).toContain('0:11')
    expect(wrapper.attributes('data-state')).toBe('running')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(wrapper.text()).toContain('0:10')
    expect(wrapper.attributes('data-state')).toBe('warning')
  })

  it('emits expired exactly once and shows the expired label', async () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START + 5_000, expiredLabel: 'Rate expired' } })
    await vi.advanceTimersByTimeAsync(4_900)
    expect(wrapper.emitted('expired')).toBeUndefined()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(wrapper.emitted('expired')).toHaveLength(1)
    expect(wrapper.text()).toBe('Rate expired')
    expect(wrapper.attributes('data-state')).toBe('expired')
  })

  it('emits at once when it is given a time already in the past', () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START - 1 } })
    expect(wrapper.emitted('expired')).toHaveLength(1)
  })

  it('starts again when it gets a new expiry time', async () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START + 2_000 } })
    await vi.advanceTimersByTimeAsync(3_000)
    expect(wrapper.emitted('expired')).toHaveLength(1)
    await wrapper.setProps({ expiresAt: Date.now() + 30_000 })
    expect(wrapper.attributes('data-state')).toBe('running')
    expect(wrapper.text()).toContain('0:30')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(wrapper.emitted('expired')).toHaveLength(2)
  })

  it('stops its timer when it is removed', () => {
    const wrapper = mount(DsCountdown, { props: { expiresAt: START + 30_000 } })
    expect(vi.getTimerCount()).toBe(1)
    wrapper.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
