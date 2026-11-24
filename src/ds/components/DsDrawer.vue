<script setup lang="ts">
import { ref, useId } from 'vue'
import { useFocusTrap } from '../composables/useFocusTrap'
import DsIcon from './DsIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    /** Which edge the drawer is attached to. */
    side?: 'right' | 'bottom'
  }>(),
  { side: 'right' },
)

const emit = defineEmits<{
  /** Asked to close: the close button, Escape, or a click outside. The parent owns `open`. */
  close: []
}>()

defineSlots<{
  default(): unknown
  /** Controls next to the title. */
  'header-actions'?(): unknown
  footer?(): unknown
}>()

const panel = ref<HTMLElement | null>(null)
const titleId = `drawer-${useId()}`
const { onKeydown } = useFocusTrap(
  panel,
  () => props.open,
  () => emit('close'),
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ds-overlay" :class="`ds-overlay--${side}`" @mousedown.self="emit('close')">
      <section
        ref="panel"
        class="ds-drawer"
        :class="`ds-drawer--${side}`"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <header class="ds-drawer__header">
          <h2 :id="titleId" class="ds-drawer__title">{{ title }}</h2>
          <div class="ds-drawer__header-actions"><slot name="header-actions" /></div>
          <button type="button" class="ds-icon-button" aria-label="Close" @click="emit('close')">
            <DsIcon name="close" />
          </button>
        </header>
        <div class="ds-drawer__body"><slot /></div>
        <footer v-if="$slots.footer" class="ds-drawer__footer"><slot name="footer" /></footer>
      </section>
    </div>
  </Teleport>
</template>

<style lang="scss">
@use '../tokens/_tokens.scss' as t;

.ds-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: flex;
  background: rgba(22, 34, 46, 0.45);

  &--right {
    justify-content: flex-end;
  }

  &--bottom {
    align-items: flex-end;
  }

  &--center {
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
}

.ds-drawer {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
  animation: ds-rise var(--motion-base) var(--motion-ease);

  &:focus,
  &:focus-visible {
    outline: none;
  }

  &--right {
    width: min(440px, 100%);
    height: 100%;
  }

  // As tall as its content, up to a limit: two log rows do not need half the screen.
  &--bottom {
    width: 100%;
    min-height: 140px;
    max-height: min(60vh, 560px);
    border-top: 1px solid var(--color-control-border);
  }

  &__header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-divider);
  }

  &__title {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  &__header-actions {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
    min-width: 0;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  &__footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-divider);
  }
}

.ds-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;

  &:hover {
    background: var(--color-row-hover);
  }
}

@keyframes ds-rise {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-drawer,
  .ds-dialog {
    animation: none;
  }
}

@media (max-width: t.$breakpoint-phone) {
  .ds-icon-button {
    width: 44px;
    height: 44px;
  }
}
</style>
