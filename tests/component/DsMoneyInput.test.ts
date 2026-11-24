import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DsMoneyInput from '@/ds/components/DsMoneyInput.vue'

function mountInput(props: { currency: string; decimals: number }) {
  return mount(DsMoneyInput, { props: { ...props, modelValue: null, text: '' } })
}

function lastEmit<T>(wrapper: ReturnType<typeof mountInput>, event: string): T | undefined {
  const calls = wrapper.emitted(event)
  return calls?.[calls.length - 1]?.[0] as T | undefined
}

describe('DsMoneyInput', () => {
  it('emits minor units as an integer string, not a number', async () => {
    const wrapper = mountInput({ currency: 'NGN', decimals: 2 })
    await wrapper.get('input').setValue('2450000.5')
    const value = lastEmit<string>(wrapper, 'update:modelValue')
    expect(value).toBe('245000050')
    expect(typeof value).toBe('string')
    expect(lastEmit(wrapper, 'problem')).toBeNull()
  })

  it('emits null and a problem for too many decimal places', async () => {
    const wrapper = mountInput({ currency: 'UGX', decimals: 0 })
    await wrapper.get('input').setValue('7450000')
    await wrapper.setProps({ modelValue: '7450000' })
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('7450000')
    await wrapper.get('input').setValue('7450000.5')
    expect(lastEmit(wrapper, 'update:modelValue')).toBeNull()
    expect(lastEmit(wrapper, 'problem')).toBe('too_many_decimals')
  })

  it('accepts six decimal places for USDC', async () => {
    const wrapper = mountInput({ currency: 'USDC', decimals: 6 })
    await wrapper.get('input').setValue('1548.232172')
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('1548232172')
  })

  it('formats the text with group separators on blur and keeps the raw text in v-model:text', async () => {
    const wrapper = mountInput({ currency: 'NGN', decimals: 2 })
    const input = wrapper.get('input')
    await input.setValue('2450000')
    expect(lastEmit(wrapper, 'update:text')).toBe('2450000')
    await input.trigger('blur')
    expect(lastEmit(wrapper, 'update:text')).toBe('2,450,000.00')
  })

  it('re-reads the same text when the currency changes its decimal places', async () => {
    const wrapper = mount(DsMoneyInput, { props: { currency: 'NGN', decimals: 2, modelValue: null, text: '' } })
    await wrapper.get('input').setValue('1500.50')
    await wrapper.setProps({ text: '1500.50' })
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('150050')
    await wrapper.setProps({ currency: 'UGX', decimals: 0 })
    expect(lastEmit(wrapper, 'update:modelValue')).toBeNull()
    expect(lastEmit(wrapper, 'problem')).toBe('too_many_decimals')
  })

  it('reports the problem for the text just typed when the parent controls the text', async () => {
    const wrapper = mount(DsMoneyInput, {
      props: {
        currency: 'UGX',
        decimals: 0,
        modelValue: null,
        text: '',
        'onUpdate:text': (value: string) => void wrapper.setProps({ text: value }),
        'onUpdate:modelValue': (value: string | null) => void wrapper.setProps({ modelValue: value }),
      },
    })
    await wrapper.get('input').setValue('7450000.5')
    expect(lastEmit(wrapper, 'problem')).toBe('too_many_decimals')
    await wrapper.get('input').setValue('7450000')
    expect(lastEmit(wrapper, 'problem')).toBeNull()
    expect(lastEmit(wrapper, 'update:modelValue')).toBe('7450000')
    await wrapper.setProps({ text: '' })
    expect(lastEmit(wrapper, 'problem')).toBe('empty')
    expect(lastEmit(wrapper, 'update:modelValue')).toBeNull()
  })

  it('shows the currency code and passes the accessibility wiring to the input', () => {
    const wrapper = mount(DsMoneyInput, {
      props: { currency: 'KES', decimals: 2, id: 'amount', describedBy: 'amount-hint amount-error', invalid: true, required: true },
    })
    const input = wrapper.get('input')
    expect(wrapper.get('.ds-money__code').text()).toBe('KES')
    expect(input.attributes()).toMatchObject({
      id: 'amount',
      inputmode: 'decimal',
      'aria-invalid': 'true',
      'aria-required': 'true',
      'aria-describedby': 'amount-hint amount-error',
    })
    expect(input.attributes('placeholder')).toBe('0.00')
  })
})
