<script setup lang="ts">
import { computed, watch } from 'vue'
import { formatMinor, parseAmount, type ParseProblem } from '../utils/money'

const props = withDefaults(
  defineProps<{
    /** Shown after the number, for example NGN. */
    currency: string
    /** Decimal places of the currency's minor unit: 0, 2 or 6 here. */
    decimals: number
    id?: string
    describedBy?: string
    invalid?: boolean
    required?: boolean
    disabled?: boolean
  }>(),
  { id: undefined, describedBy: undefined, invalid: false, required: false, disabled: false },
)

/** Minor units as an integer string, or null while the text is not a valid amount. Never a float. */
const minor = defineModel<string | null>({ default: null })
/** The text as typed. Bind it to validate the raw input in a form. */
const text = defineModel<string>('text', { default: '' })

const emit = defineEmits<{
  /** Why the text is not an amount, or null once it is. */
  problem: [problem: ParseProblem | null]
}>()

const placeholder = computed(() => (props.decimals === 0 ? '0' : `0.${'0'.repeat(props.decimals)}`))

let lastProblem: ParseProblem | null | undefined

function sync(value: string) {
  const parsed = parseAmount(value, props.decimals)
  const next = parsed.ok ? parsed.minor.toString() : null
  if (next !== minor.value) minor.value = next
  const problem = parsed.ok ? null : parsed.problem
  if (problem !== lastProblem) {
    lastProblem = problem
    emit('problem', problem)
  }
}

function onInput(event: Event) {
  // Read the element, not the model: when the parent controls the text, the model has not caught up yet.
  const value = (event.target as HTMLInputElement).value
  text.value = value
  sync(value)
}

function onBlur(event: FocusEvent) {
  const value = (event.target as HTMLInputElement).value
  const parsed = parseAmount(value, props.decimals)
  if (parsed.ok) text.value = formatMinor(parsed.minor, props.decimals)
}

// A change of currency changes what the same text means.
watch(
  () => props.decimals,
  () => sync(text.value),
)

// Text set from outside (a prefill, a reset) still has to produce minor units.
watch(text, (value) => sync(value))
</script>

<template>
  <div class="ds-money" :class="{ 'ds-money--invalid': invalid, 'ds-money--disabled': disabled }">
    <input
      :id="id"
      class="ds-money__input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      spellcheck="false"
      :value="text"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-required="required ? 'true' : undefined"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="onBlur"
    />
    <span class="ds-money__code" aria-hidden="true">{{ currency }}</span>
  </div>
</template>

<style lang="scss">
.ds-money {
  display: flex;
  align-items: stretch;
  height: var(--size-control);
  border: 1px solid var(--color-control-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);

  &:focus-within {
    outline: 2px solid var(--color-primary);
    outline-offset: 1px;
  }

  &--invalid {
    border-color: var(--color-danger-text);
    box-shadow: inset 0 0 0 1px var(--color-danger-text);
  }

  &--disabled,
  &:has(.ds-money__input:disabled) {
    background: var(--color-neutral-tint);
  }

  &__input {
    flex: 1;
    min-width: 0;
    padding: 0 var(--space-2);
    border: 0;
    background: transparent;
    color: var(--color-ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
    text-align: right;

    &:focus,
    &:focus-visible {
      outline: none;
    }

    &::placeholder {
      color: var(--color-muted);
    }

    &:disabled {
      color: var(--color-muted);
      cursor: not-allowed;
    }
  }

  &__code {
    display: flex;
    align-items: center;
    padding: 0 var(--space-2);
    border-left: 1px solid var(--color-divider);
    color: var(--color-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.02em;
  }
}
</style>
