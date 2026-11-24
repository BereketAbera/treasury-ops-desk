<script setup lang="ts">
import { computed } from 'vue'
import DsIcon from './DsIcon.vue'
import type { IconName } from './icons'
import type { Tone } from './status'

const props = withDefaults(
  defineProps<{
    tone?: Tone
    title?: string
    /**
     * How the banner is announced. "alert" interrupts and suits errors that need
     * action now. "status" waits its turn. "none" is for static page content.
     */
    announce?: 'alert' | 'status' | 'none'
    dismissible?: boolean
  }>(),
  { tone: 'info', title: undefined, announce: 'none', dismissible: false },
)

defineEmits<{ dismiss: [] }>()

defineSlots<{
  default(): unknown
  /** Buttons or links for the next step. */
  actions?(): unknown
}>()

const ICON_BY_TONE: Record<Tone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
  unknown: 'question-circle',
}

const role = computed(() => (props.announce === 'none' ? undefined : props.announce))
</script>

<template>
  <div class="ds-banner" :class="`ds-banner--${tone}`" :role="role">
    <DsIcon class="ds-banner__icon" :name="ICON_BY_TONE[tone]" :size="18" />
    <div class="ds-banner__body">
      <p v-if="title" class="ds-banner__title">{{ title }}</p>
      <div class="ds-banner__text"><slot /></div>
      <div v-if="$slots.actions" class="ds-banner__actions"><slot name="actions" /></div>
    </div>
    <button v-if="dismissible" type="button" class="ds-banner__dismiss" aria-label="Dismiss" @click="$emit('dismiss')">
      <DsIcon name="close" :size="14" />
    </button>
  </div>
</template>

<style lang="scss">
.ds-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-left: 4px solid currentColor;
  border-radius: var(--radius-md);

  &--neutral {
    background: var(--color-neutral-tint);
    color: var(--color-neutral-text);
  }

  &--info {
    background: var(--color-info-tint);
    color: var(--color-info-text);
  }

  &--success {
    background: var(--color-success-tint);
    color: var(--color-success-text);
  }

  &--warning {
    background: var(--color-warning-tint);
    color: var(--color-warning-text);
  }

  &--danger {
    background: var(--color-danger-tint);
    color: var(--color-danger-text);
  }

  &--unknown {
    background: var(--color-unknown-tint);
    color: var(--color-unknown-text);
  }

  &__icon {
    margin-top: 1px;
  }

  &__body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: var(--space-1);
  }

  &__title {
    margin: 0;
    font-weight: var(--font-weight-bold);
  }

  &__text {
    color: var(--color-ink);

    p {
      margin: 0;
    }

    p + p {
      margin-top: var(--space-1);
    }
  }

  &__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  &__dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover {
      background: rgba(22, 34, 46, 0.08);
    }
  }
}
</style>
