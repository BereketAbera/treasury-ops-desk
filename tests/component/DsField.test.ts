import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import DsField from '@/ds/components/DsField.vue'
import DsTextInput from '@/ds/components/DsTextInput.vue'

function mountField(props: Record<string, unknown>) {
  return mount(DsField, {
    props: { label: 'Account number', ...props },
    slots: {
      default: (field: Record<string, unknown>) => h(DsTextInput, { ...field, modelValue: '', 'onUpdate:modelValue': () => {} }),
    },
  })
}

describe('DsField', () => {
  it('ties the label to the control', () => {
    const wrapper = mountField({ id: 'account' })
    expect(wrapper.get('label').attributes('for')).toBe('account')
    expect(wrapper.get('input').attributes('id')).toBe('account')
  })

  it('makes an id when none is given', () => {
    const wrapper = mountField({})
    const id = wrapper.get('input').attributes('id')
    expect(id).toBeTruthy()
    expect(wrapper.get('label').attributes('for')).toBe(id)
  })

  it('describes the control by its hint', () => {
    const wrapper = mountField({ id: 'account', hint: '10 digits.' })
    expect(wrapper.get('input').attributes('aria-describedby')).toBe('account-hint')
    expect(wrapper.get('#account-hint').text()).toBe('10 digits.')
    expect(wrapper.get('input').attributes('aria-invalid')).toBeUndefined()
  })

  it('marks the control invalid and describes it by the hint and the error', () => {
    const wrapper = mountField({ id: 'account', hint: '10 digits.', error: 'This is not a valid account number.' })
    const input = wrapper.get('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe('account-hint account-error')
    expect(wrapper.get('#account-error').text()).toBe('This is not a valid account number.')
    expect(wrapper.get('#account-error').find('svg').exists()).toBe(true)
  })

  it('marks required controls and labels the others as optional', () => {
    expect(mountField({ required: true }).get('input').attributes('aria-required')).toBe('true')
    expect(mountField({ required: true }).find('.ds-field__optional').exists()).toBe(false)
    expect(mountField({ required: false }).get('.ds-field__optional').text()).toBe('optional')
  })
})
