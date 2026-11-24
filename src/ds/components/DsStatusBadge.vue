<script setup lang="ts">
import { computed } from 'vue'
import DsIcon from './DsIcon.vue'
import { STATUS_LOOK, type StatusName } from './status'

const props = withDefaults(
  defineProps<{
    /** A status from the shared vocabulary. Tone and icon follow from it. */
    status: StatusName
    /** Replaces the default text, for example "9 of 12 booked". The tone and icon stay. */
    label?: string
  }>(),
  { label: undefined },
)

const look = computed(() => STATUS_LOOK[props.status])
</script>

<template>
  <span class="ds-badge" :class="`ds-badge--${look.tone}`" :data-status="status">
    <DsIcon :name="look.icon" :size="14" />
    <span class="ds-badge__label">{{ label ?? look.label }}</span>
  </span>
</template>

<style lang="scss">
.ds-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  max-width: 100%;
  height: 20px;
  padding: 0 var(--space-2) 0 6px;
  border-radius: var(--radius-pill);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  line-height: 1;
  white-space: nowrap;

  &--neutral {
    background: var(--color-neutral-tint);
    color: var(--color-neutral-text);
  }

  &--warning {
    background: var(--color-warning-tint);
    color: var(--color-warning-text);
  }

  &--info {
    background: var(--color-info-tint);
    color: var(--color-info-text);
  }

  &--success {
    background: var(--color-success-tint);
    color: var(--color-success-text);
  }

  &--danger {
    background: var(--color-danger-tint);
    color: var(--color-danger-text);
  }

  &--unknown {
    background: var(--color-unknown-tint);
    color: var(--color-unknown-text);
  }
}
</style>
