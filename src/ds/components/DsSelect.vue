<script setup lang="ts">
export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

withDefaults(
  defineProps<{
    options: SelectOption[]
    /** Text of the empty first option. Omit to have no empty option. */
    placeholder?: string
    id?: string
    describedBy?: string
    invalid?: boolean
    required?: boolean
    disabled?: boolean
  }>(),
  { placeholder: undefined, id: undefined, describedBy: undefined, invalid: false, required: false, disabled: false },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <select
    :id="id"
    v-model="model"
    class="ds-select"
    :disabled="disabled"
    :aria-required="required ? 'true' : undefined"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-describedby="describedBy"
  >
    <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
    <option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">
      {{ option.label }}
    </option>
  </select>
</template>

<style lang="scss">
.ds-select {
  padding-right: var(--space-5);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2352606D' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 6L8 10.5 12.5 6'/%3E%3C/svg%3E");
  background-position: right 6px center;
  background-size: 14px 14px;
  background-repeat: no-repeat;
}
</style>
