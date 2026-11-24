<script setup lang="ts">
import { computed } from 'vue'
import { formatMinor } from '../utils/money'

const props = defineProps<{
  /** Integer string of minor units. */
  minor: string
  currency: string
  decimals: number
}>()

const text = computed(() => formatMinor(props.minor, props.decimals))
</script>

<template>
  <span class="ds-amount">
    <span class="ds-amount__number">{{ text }}</span>
    <span class="ds-amount__code">{{ currency }}</span>
  </span>
</template>

<style lang="scss">
.ds-amount {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: var(--space-1);
  white-space: nowrap;

  &__number {
    font-variant-numeric: tabular-nums;
  }

  &__code {
    min-width: 4ch;
    color: var(--color-muted);
    font-size: var(--font-size-xs);
    text-align: left;
  }
}
</style>
