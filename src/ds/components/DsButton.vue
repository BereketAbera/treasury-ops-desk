<script setup lang="ts">
import DsIcon from './DsIcon.vue'
import type { IconName } from './icons'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    type?: 'button' | 'submit'
    /** Removes the button from use. Prefer `loading` while work is in flight. */
    disabled?: boolean
    /** Work is in flight: clicks are ignored, focus is kept, aria-busy is set. */
    loading?: boolean
    icon?: IconName
    /** Renders a link that looks like a button. */
    href?: string
  }>(),
  { variant: 'secondary', size: 'md', type: 'button', disabled: false, loading: false, icon: undefined, href: undefined },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

function onClick(event: MouseEvent) {
  if (props.loading || props.disabled) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <a v-if="href" :href="href" class="ds-button" :class="[`ds-button--${variant}`, `ds-button--${size}`]">
    <DsIcon v-if="icon" :name="icon" />
    <span class="ds-button__label"><slot /></span>
  </a>
  <button
    v-else
    :type="type"
    class="ds-button"
    :class="[`ds-button--${variant}`, `ds-button--${size}`, { 'ds-button--loading': loading }]"
    :disabled="disabled"
    :aria-disabled="loading ? 'true' : undefined"
    :aria-busy="loading ? 'true' : undefined"
    @click="onClick"
  >
    <DsIcon v-if="icon || loading" :name="loading ? 'progress' : icon!" :class="{ 'ds-button__spinner': loading }" />
    <span class="ds-button__label"><slot /></span>
  </button>
</template>

<style lang="scss">
.ds-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--size-control);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-control-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;
  font-weight: var(--font-weight-medium);
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--motion-ease);

  &:hover {
    background: var(--color-row-hover);
  }

  &:disabled,
  &[aria-disabled='true'] {
    cursor: not-allowed;
    background: var(--color-neutral-tint);
    border-color: var(--color-neutral-tint);
    color: var(--color-muted);
  }

  &--sm {
    min-height: 24px;
    padding: 0 var(--space-2);
    font-size: var(--font-size-xs);
  }

  &--primary:not(:disabled):not([aria-disabled='true']) {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: var(--color-on-primary);

    &:hover {
      background: var(--color-primary-strong);
    }
  }

  &--ghost:not(:disabled):not([aria-disabled='true']) {
    border-color: transparent;
    background: transparent;
    color: var(--color-primary);

    &:hover {
      background: var(--color-row-hover);
    }
  }

  &--danger:not(:disabled):not([aria-disabled='true']) {
    border-color: var(--color-danger-text);
    color: var(--color-danger-text);
  }

  &__spinner {
    animation: ds-spin 0.9s linear infinite;
  }
}

@keyframes ds-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ds-button__spinner {
    animation: none;
  }
}
</style>
