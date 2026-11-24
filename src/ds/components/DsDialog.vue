<script setup lang="ts">
import { ref, useId } from 'vue'
import { useFocusTrap } from '../composables/useFocusTrap'

const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  /** Asked to close: Escape or a click outside. The parent owns `open`. */
  close: []
}>()

defineSlots<{
  default(): unknown
  /** The buttons. Put the safe choice first. */
  actions?(): unknown
}>()

const panel = ref<HTMLElement | null>(null)
const titleId = `dialog-${useId()}`
const bodyId = `dialog-body-${useId()}`
const { onKeydown } = useFocusTrap(
  panel,
  () => props.open,
  () => emit('close'),
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ds-overlay ds-overlay--center" @mousedown.self="emit('close')">
      <section
        ref="panel"
        class="ds-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="bodyId"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <h2 :id="titleId" class="ds-dialog__title">{{ title }}</h2>
        <div :id="bodyId" class="ds-dialog__body"><slot /></div>
        <div v-if="$slots.actions" class="ds-dialog__actions"><slot name="actions" /></div>
      </section>
    </div>
  </Teleport>
</template>

<style lang="scss">
.ds-dialog {
  width: min(440px, 100%);
  padding: var(--space-5);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-overlay);
  animation: ds-rise var(--motion-base) var(--motion-ease);

  &:focus,
  &:focus-visible {
    outline: none;
  }

  &__title {
    margin: 0 0 var(--space-2);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  &__body {
    color: var(--color-ink);

    p {
      margin: 0 0 var(--space-2);
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
}
</style>
