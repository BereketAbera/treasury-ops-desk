import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import DsDialog from '@/ds/components/DsDialog.vue'
import DsDrawer from '@/ds/components/DsDrawer.vue'

const Host = defineComponent({
  props: { kind: { type: String, default: 'drawer' } },
  setup(props) {
    const open = ref(false)
    return () =>
      h('div', [
        h('button', { id: 'opener', onClick: () => (open.value = true) }, 'Open'),
        h(
          props.kind === 'drawer' ? DsDrawer : DsDialog,
          { open: open.value, title: 'Request log', onClose: () => (open.value = false) },
          { default: () => [h('button', { id: 'first' }, 'First'), h('button', { id: 'last' }, 'Last')] },
        ),
      ])
  },
})

async function settle() {
  await nextTick()
  await nextTick()
}

function key(target: Element | null, name: string, shiftKey = false) {
  target?.dispatchEvent(new KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true }))
}

afterEach(() => {
  document.body.innerHTML = ''
  document.documentElement.className = ''
})

// Called once per component with plain describe blocks, so the test listing counts all six tests.
function focusManagement(kind: 'drawer' | 'dialog') {
  it('is a labelled modal dialog and takes focus when it opens', async () => {
    const wrapper = mount(Host, { attachTo: document.body, props: { kind } })
    const opener = document.getElementById('opener')!
    opener.focus()
    opener.click()
    await settle()
    const panel = document.querySelector('[role="dialog"]')!
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe('Request log')
    expect(panel.contains(document.activeElement)).toBe(true)
    wrapper.unmount()
  })

  it('keeps Tab inside and wraps at both ends', async () => {
    const wrapper = mount(Host, { attachTo: document.body, props: { kind } })
    document.getElementById('opener')!.click()
    await settle()
    const panel = document.querySelector('[role="dialog"]')!
    const focusable = panel.querySelectorAll<HTMLElement>('button')
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    last.focus()
    key(last, 'Tab')
    expect(document.activeElement).toBe(first)
    key(first, 'Tab', true)
    expect(document.activeElement).toBe(last)
    wrapper.unmount()
  })

  it('closes on Escape and puts focus back on the control that opened it', async () => {
    const wrapper = mount(Host, { attachTo: document.body, props: { kind } })
    const opener = document.getElementById('opener')!
    opener.focus()
    opener.click()
    await settle()
    expect(document.documentElement.classList.contains('ds-scroll-lock')).toBe(true)
    key(document.activeElement, 'Escape')
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.documentElement.classList.contains('ds-scroll-lock')).toBe(false)
    wrapper.unmount()
  })
}

describe('focus management in the drawer', () => focusManagement('drawer'))
describe('focus management in the dialog', () => focusManagement('dialog'))
