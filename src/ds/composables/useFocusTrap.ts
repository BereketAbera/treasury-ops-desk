import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let openLayers = 0

/**
 * Keeps keyboard focus inside a container while it is open, closes on Escape,
 * and puts focus back where it was when the container closes.
 */
export function useFocusTrap(container: Ref<HTMLElement | null>, isOpen: () => boolean, onEscape: () => void) {
  let returnTo: HTMLElement | null = null
  let locked = false

  function lock() {
    if (locked) return
    locked = true
    openLayers += 1
    document.documentElement.classList.add('ds-scroll-lock')
  }

  function unlock() {
    if (!locked) return
    locked = false
    openLayers -= 1
    if (openLayers <= 0) {
      openLayers = 0
      document.documentElement.classList.remove('ds-scroll-lock')
    }
  }

  function restore() {
    unlock()
    if (returnTo && document.contains(returnTo)) returnTo.focus()
    returnTo = null
  }

  watch(
    isOpen,
    async (open, wasOpen) => {
      if (open) {
        returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
        lock()
        await nextTick()
        const target = container.value?.querySelector<HTMLElement>('[data-autofocus]') ?? container.value
        target?.focus()
      } else if (wasOpen) {
        restore()
      }
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(() => {
    if (locked) restore()
  })

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onEscape()
      return
    }
    if (event.key !== 'Tab' || !container.value) return
    const items = Array.from(container.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (item) => item.getAttribute('aria-hidden') !== 'true',
    )
    if (items.length === 0) {
      event.preventDefault()
      container.value.focus()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === container.value)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return { onKeydown }
}
