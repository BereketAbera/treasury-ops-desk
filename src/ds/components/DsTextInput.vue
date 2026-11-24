<script setup lang="ts">
withDefaults(
  defineProps<{
    id?: string
    /** IDs of the hint and error text, from DsField. */
    describedBy?: string
    invalid?: boolean
    required?: boolean
    disabled?: boolean
    /** Monospace, for IDs, keys and account numbers. */
    mono?: boolean
    type?: 'text' | 'search'
    inputmode?: 'text' | 'numeric' | 'decimal' | 'search'
    placeholder?: string
    autocomplete?: string
    maxlength?: number
  }>(),
  {
    id: undefined,
    describedBy: undefined,
    invalid: false,
    required: false,
    disabled: false,
    mono: false,
    type: 'text',
    inputmode: 'text',
    placeholder: undefined,
    autocomplete: 'off',
    maxlength: undefined,
  },
)

const model = defineModel<string>({ required: true })
</script>

<template>
  <input
    :id="id"
    v-model="model"
    class="ds-input"
    :class="{ 'ds-input--mono': mono }"
    :type="type"
    :inputmode="inputmode"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :maxlength="maxlength"
    :disabled="disabled"
    :aria-required="required ? 'true' : undefined"
    :aria-invalid="invalid ? 'true' : undefined"
    :aria-describedby="describedBy"
    spellcheck="false"
  />
</template>

<style lang="scss">
.ds-input,
.ds-select {
  width: 100%;
  min-width: 0;
  height: var(--size-control);
  padding: 0 var(--space-2);
  border: 1px solid var(--color-control-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font: inherit;

  &::placeholder {
    color: var(--color-muted);
  }

  &[aria-invalid='true'] {
    border-color: var(--color-danger-text);
    box-shadow: inset 0 0 0 1px var(--color-danger-text);
  }

  &:disabled {
    background: var(--color-neutral-tint);
    color: var(--color-muted);
    cursor: not-allowed;
  }
}

.ds-input--mono {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
}
</style>
