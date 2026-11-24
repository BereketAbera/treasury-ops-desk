import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DsRate from '@/ds/components/DsRate.vue'

describe('DsRate', () => {
  it('groups the whole part and pads to the given places', () => {
    expect(mount(DsRate, { props: { rate: '3712.46', places: 2 } }).text()).toBe('3,712.46')
    expect(mount(DsRate, { props: { rate: '18.274', places: 4 } }).text()).toBe('18.2740')
    expect(mount(DsRate, { props: { rate: '129.3', places: 2 } }).text()).toBe('129.30')
  })

  it('keeps the whole part and the fraction apart, so a column can line up on the decimal point', () => {
    const wrapper = mount(DsRate, { props: { rate: '1582.45', places: 2, alignPlaces: 4 } })
    expect(wrapper.get('.ds-rate__whole').text()).toBe('1,582')
    expect(wrapper.get('.ds-rate__fraction').text()).toBe('.45')
    expect(wrapper.get('.ds-rate__fraction').attributes('data-align')).toBe('4')
  })
})
