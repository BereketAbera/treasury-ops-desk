<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  /** Name of the group, read before the options. */
  legend: string
  options: { value: string; label: string }[]
}>()

const model = defineModel<string>({ required: true })
const name = `segmented-${useId()}`
</script>

<template>
  <fieldset class="ds-segmented">
    <legend class="ds-segmented__legend">{{ legend }}</legend>
    <label v-for="option in options" :key="option.value" class="ds-segmented__option">
      <input v-model="model" class="ds-segmented__input" type="radio" :name="name" :value="option.value" />
      <span class="ds-segmented__label">{{ option.label }}</span>
    </label>
  </fieldset>
</template>

<style lang="scss">
.ds-segmented {
  display: inline-flex;
  align-items: center;
  margin: 0;
  padding: 0;
  border: 0;

  &__legend {
    float: left;
    margin-right: var(--space-2);
    padding: 0;
    color: var(--color-muted);
    font-size: var(--font-size-xs);
  }

  &__option {
    position: relative;
    display: inline-flex;
    cursor: pointer;
  }

  &__input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  &__label {
    display: inline-flex;
    align-items: center;
    height: 26px;
    padding: 0 var(--space-2);
    border: 1px solid var(--color-control-border);
    margin-left: -1px;
    background: var(--color-surface);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
  }

  &__option:first-of-type &__label {
    margin-left: 0;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  &__option:last-of-type &__label {
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  &__input:checked + &__label {
    position: relative;
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-on-primary);
    font-weight: var(--font-weight-bold);
  }

  &__input:focus-visible + &__label {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
    z-index: 1;
  }
}
</style>
